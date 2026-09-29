<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Validator;
use Carbon\Carbon;

/**
 * Controller handling attendance events from B-29b Node.js Agent & Authenticated Vue UI imports
 * Endpoints:
 * - POST /api/attendance/device-event   (Node Agent with X-Agent-Key)
 * - POST /api/attendance/batch-sync     (Node Agent incremental sync)
 * - POST /api/attendance/import         (Authenticated HR user chunked import)
 * - GET  /api/attendance/logs           (Query filtered paginated logs)
 */
class AttendanceDeviceController extends Controller
{
    /**
     * Ingests a real-time attendance scan from BISMAC BISBIO B-29b
     */
    public function handleDeviceEvent(Request $request)
    {
        // 1. Authenticate agent via secret key
        $agentKey = $request->header('X-Agent-Key');
        if ($agentKey !== config('services.biometric.agent_secret', 'dmbbhr-secret-agent-key')) {
            return response()->json(['error' => 'Unauthorized agent request'], 401);
        }

        // 2. Validate event payload
        $validator = Validator::make($request->all(), [
            'user_id' => 'required|string',
            'attendance_time' => 'required|string',
            'type' => 'nullable|integer',
            'state' => 'nullable|integer',
            'serial_number' => 'nullable',
            'device_ip' => 'nullable|ip',
            'device_serial' => 'nullable|string',
            'location_id' => 'nullable|string',
            'is_duplicate' => 'nullable|boolean',
            'raw_data' => 'nullable'
        ]);

        if ($validator->fails()) {
            return response()->json([
                'status' => 'error',
                'errors' => $validator->errors()
            ], 422);
        }

        $data = $validator->validated();

        // 3. Normalize timestamp to Philippine Standard Time (Asia/Manila)
        try {
            $attTime = Carbon::parse($data['attendance_time'])->setTimezone('Asia/Manila');
        } catch (\Exception $e) {
            $attTime = Carbon::now('Asia/Manila');
        }

        // 4. Resolve Employee ID by Biometric User ID
        $employee = DB::table('employees')
            ->where('biometric_user_id', $data['user_id'])
            ->first();

        // 5. Store immutable raw attendance log
        $logId = (string) \Illuminate\Support\Str::uuid();

        DB::table('attendance_logs')->insert([
            'id' => $logId,
            'user_id' => $data['user_id'],
            'employee_id' => $employee ? $employee->id : null,
            'attendance_time' => $attTime->toDateTimeString(),
            'type' => $data['type'] ?? 1,
            'state' => $data['state'] ?? 1,
            'serial_number' => $data['serial_number'] ?? 0,
            'device_id' => $data['device_serial'] ?? '0476141400046',
            'device_ip' => $data['device_ip'] ?? '192.168.1.201',
            'location_id' => $data['location_id'] ?? 'loc-cebu',
            'is_duplicate' => (bool)($data['is_duplicate'] ?? false),
            'raw_payload' => is_string($data['raw_data'] ?? '') ? $data['raw_data'] : json_encode($data['raw_data'] ?? []),
            'created_at' => Carbon::now('Asia/Manila')->toDateTimeString(),
        ]);

        Log::info("Biometric scan saved for user {$data['user_id']} at {$attTime->toDateTimeString()}");

        return response()->json([
            'status' => 'success',
            'message' => 'Attendance event stored successfully',
            'log_id' => $logId,
            'employee_name' => $employee ? "{$employee->last_name}, {$employee->first_name}" : 'Unassigned',
            'timestamp_ph' => $attTime->toDateTimeString()
        ], 201);
    }

    /**
     * Chunked attendance import endpoint for authenticated HR / Admin users.
     * Enforces role verification, transaction safety, and duplicate preservation.
     */
    public function handleChunkedImport(Request $request)
    {
        // Must be authenticated user with admin or hr role
        $user = $request->user();
        if ($user && !in_array($user->role, ['admin', 'hr'])) {
            return response()->json(['error' => 'Forbidden: Insufficient privileges for attendance import.'], 403);
        }

        $records = $request->input('records', []);
        if (!is_array($records) || empty($records)) {
            return response()->json(['error' => 'No records provided in chunk.'], 422);
        }

        $inserted = 0;
        $flaggedDuplicates = 0;

        DB::beginTransaction();
        try {
            foreach ($records as $r) {
                if (empty($r['user_id']) || empty($r['attendance_time'])) continue;

                $attTime = Carbon::parse($r['attendance_time'])->setTimezone('Asia/Manila');

                // Check duplicate within 5 seconds for same user
                $isDup = (bool)($r['is_duplicate'] ?? false);
                if (!$isDup) {
                    $existing = DB::table('attendance_logs')
                        ->where('user_id', (string)$r['user_id'])
                        ->whereBetween('attendance_time', [
                            $attTime->copy()->subSeconds(5)->toDateTimeString(),
                            $attTime->copy()->addSeconds(5)->toDateTimeString()
                        ])
                        ->exists();

                    if ($existing) {
                        $isDup = true;
                        $flaggedDuplicates++;
                    }
                }

                $employee = DB::table('employees')->where('biometric_user_id', (string)$r['user_id'])->first();

                DB::table('attendance_logs')->insert([
                    'id' => (string) \Illuminate\Support\Str::uuid(),
                    'user_id' => (string)$r['user_id'],
                    'employee_id' => $employee ? $employee->id : null,
                    'attendance_time' => $attTime->toDateTimeString(),
                    'type' => (int)($r['type'] ?? 1),
                    'state' => (int)($r['state'] ?? 1),
                    'serial_number' => (int)($r['serial_number'] ?? 0),
                    'device_id' => $r['device_id'] ?? 'dev-1',
                    'device_ip' => $r['device_ip'] ?? '192.168.1.201',
                    'location_id' => $r['location_id'] ?? 'loc-cebu',
                    'is_duplicate' => $isDup,
                    'raw_payload' => json_encode($r),
                    'created_at' => Carbon::now('Asia/Manila')->toDateTimeString(),
                ]);

                $inserted++;
            }

            DB::commit();

            return response()->json([
                'status' => 'success',
                'inserted' => $inserted,
                'duplicates_flagged' => $flaggedDuplicates
            ]);
        } catch (\Exception $e) {
            DB::rollBack();
            Log::error("Import chunk error: " . $e->getMessage());
            return response()->json(['error' => 'Database error inserting chunk: ' . $e->getMessage()], 500);
        }
    }

    /**
     * Batch sync for incremental historical data from B-29b
     */
    public function handleBatchSync(Request $request)
    {
        $agentKey = $request->header('X-Agent-Key');
        if ($agentKey !== config('services.biometric.agent_secret', 'dmbbhr-secret-agent-key')) {
            return response()->json(['error' => 'Unauthorized agent request'], 401);
        }

        $records = $request->input('records', []);
        $inserted = 0;

        foreach ($records as $r) {
            if (empty($r['userId']) || empty($r['dateTime'])) continue;

            $attTime = Carbon::parse($r['dateTime'])->setTimezone('Asia/Manila');
            $employee = DB::table('employees')->where('biometric_user_id', $r['userId'])->first();

            DB::table('attendance_logs')->insertOrIgnore([
                'id' => (string) \Illuminate\Support\Str::uuid(),
                'user_id' => (string)$r['userId'],
                'employee_id' => $employee ? $employee->id : null,
                'attendance_time' => $attTime->toDateTimeString(),
                'type' => (int)($r['type'] ?? 1),
                'state' => (int)($r['state'] ?? 1),
                'serial_number' => (int)($r['serial'] ?? 0),
                'device_id' => '0476141400046',
                'device_ip' => $r['ip'] ?? '192.168.1.201',
                'location_id' => 'loc-cebu',
                'is_duplicate' => false,
                'created_at' => Carbon::now('Asia/Manila')->toDateTimeString(),
            ]);
            $inserted++;
        }

        return response()->json([
            'status' => 'success',
            'received' => count($records),
            'inserted' => $inserted
        ]);
    }
}
