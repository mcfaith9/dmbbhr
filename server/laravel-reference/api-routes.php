<?php

use Illuminate\Support\Facades\Route;
use App\Http\Controllers\Api\AttendanceDeviceController;

/*
|--------------------------------------------------------------------------
| Biometric Device API Routes (Laravel)
|--------------------------------------------------------------------------
*/

Route::prefix('attendance')->group(function () {
    // 1. Real-time scan ingestion from B-29b Node.js agent (Authenticated by X-Agent-Key header)
    Route::post('/device-event', [AttendanceDeviceController::class, 'handleDeviceEvent']);

    // 2. Incremental historical batch sync from Node.js agent
    Route::post('/batch-sync', [AttendanceDeviceController::class, 'handleBatchSync']);

    // 3. Authenticated chunked CSV/Excel import from HR/Admin Vue UI (Sanctum/Bearer protected)
    Route::middleware(['auth:sanctum'])->group(function () {
        Route::post('/import', [AttendanceDeviceController::class, 'handleChunkedImport']);
    });
});
