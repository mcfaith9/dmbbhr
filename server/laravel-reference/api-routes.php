<?php

use Illuminate\Support\Facades\Route;
use App\Http\Controllers\Api\AttendanceDeviceController;

/*
|--------------------------------------------------------------------------
| Biometric Device API Routes (Laravel)
|--------------------------------------------------------------------------
*/

Route::prefix('attendance')->group(function () {
    // 1. Real-time scan ingestion from B-29b Node.js agent
    Route::post('/device-event', [AttendanceDeviceController::class, 'handleDeviceEvent']);

    // 2. Incremental historical batch sync
    Route::post('/batch-sync', [AttendanceDeviceController::class, 'handleBatchSync']);
});
