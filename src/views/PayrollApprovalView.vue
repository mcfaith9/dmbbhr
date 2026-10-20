<template>
  <div class="space-y-4">
    <!-- Action Feedback Toast Banner -->
    <transition
      enter-active-class="transition duration-200 ease-out"
      enter-from-class="transform -translate-y-2 opacity-0"
      enter-to-class="transform translate-y-0 opacity-100"
      leave-active-class="transition duration-150 ease-in"
      leave-from-class="transform translate-y-0 opacity-100"
      leave-to-class="transform -translate-y-2 opacity-0"
    >
      <div
        v-if="actionNotice"
        class="flex items-center justify-between gap-3 px-4 py-2.5 rounded-lg border text-xs shadow-xs"
        :class="actionNotice.type === 'success' 
          ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-800 dark:text-emerald-300' 
          : 'bg-amber-500/10 border-amber-500/20 text-amber-800 dark:text-amber-300'"
      >
        <div class="flex items-center gap-2">
          <CheckCircle2 v-if="actionNotice.type === 'success'" class="size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
          <AlertCircle v-else class="size-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <span class="font-medium">{{ actionNotice.message }}</span>
        </div>
        <button
          type="button"
          class="text-muted-foreground hover:text-foreground transition-colors"
          @click="actionNotice = null"
        >
          <X class="size-3.5" />
        </button>
      </div>
    </transition>

    <!-- Page Header Section -->
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
      <div>
        <h1 class="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
          Payroll Approval
        </h1>
        <p class="text-xs text-muted-foreground mt-0.5">
          Review employee payroll snapshots, audit compensation and deduction details, and authorize cutoff disbursements.
        </p>
      </div>

      <!-- Controls & Cutoff Selector -->
      <div class="flex items-center gap-2 flex-wrap">
        <select
          v-model="selectedPeriod"
          :disabled="isLoading"
          class="h-8 rounded-md border border-input bg-background px-2.5 text-xs text-foreground font-medium focus:outline-hidden disabled:opacity-50"
          @change="onPeriodChange"
        >
          <option value="">All Cutoffs</option>
          <option v-for="p in cutoffs" :key="p.id" :value="p.id">
            {{ p.label }}
          </option>
        </select>

        <Button
          variant="outline"
          size="sm"
          class="h-8 gap-1.5 text-xs"
          :disabled="isLoading"
          @click="reload"
        >
          <RefreshCw class="size-3.5" :class="{ 'animate-spin': isLoading }" />
          Refresh
        </Button>

        <!-- Reviewer indicator -->
        <div class="hidden lg:flex items-center gap-2 pl-2 border-l border-border text-xs text-muted-foreground">
          <div class="size-7 rounded bg-muted/60 border border-border flex items-center justify-center font-semibold text-[11px] text-foreground">
            {{ reviewerInitials }}
          </div>
          <div class="leading-tight">
            <div class="font-medium text-foreground text-[11px]">{{ reviewerName }}</div>
            <div class="text-[10px] text-muted-foreground">{{ reviewerRole }} Reviewer</div>
          </div>
        </div>
      </div>
    </div>

    <!-- Error Alert Banner if fetch fails -->
    <div
      v-if="loadError"
      class="rounded-xl border border-destructive/30 bg-destructive/10 p-3.5 text-xs text-destructive flex items-center justify-between gap-3"
    >
      <div class="flex items-center gap-2">
        <AlertCircle class="size-4 shrink-0 text-destructive" />
        <span>{{ loadError }}</span>
      </div>
      <Button
        variant="outline"
        size="sm"
        class="h-7 text-xs border-destructive/40 hover:bg-destructive/15 text-destructive"
        @click="reload"
      >
        Retry
      </Button>
    </div>

    <!-- Payroll Summary Cards -->
    <div class="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <!-- Card 1: Awaiting Approval (Pending) -->
      <div class="rounded-xl border bg-card p-3 shadow-xs">
        <div class="text-[11px] font-medium text-muted-foreground flex items-center justify-between">
          <span>Awaiting Approval</span>
          <Clock class="size-3.5 text-amber-600 dark:text-amber-400" />
        </div>
        <div v-if="isLoading" class="mt-1 space-y-1">
          <Skeleton class="h-6 w-28" />
          <Skeleton class="h-3 w-16" />
        </div>
        <div v-else>
          <div class="text-xl font-bold mt-1 text-amber-600 dark:text-amber-400 font-mono tabular-nums">
            {{ formatPeso(summaryStats.pendingNetPay) }}
          </div>
          <div class="text-[10px] text-muted-foreground mt-0.5 flex items-center gap-1">
            <span class="font-semibold text-foreground">{{ summaryStats.pendingCount }}</span>
            <span>employees pending review</span>
          </div>
        </div>
      </div>

      <!-- Card 2: Approved Payroll -->
      <div class="rounded-xl border bg-card p-3 shadow-xs">
        <div class="text-[11px] font-medium text-muted-foreground flex items-center justify-between">
          <span>Approved Disbursements</span>
          <CheckCircle2 class="size-3.5 text-emerald-600 dark:text-emerald-400" />
        </div>
        <div v-if="isLoading" class="mt-1 space-y-1">
          <Skeleton class="h-6 w-28" />
          <Skeleton class="h-3 w-16" />
        </div>
        <div v-else>
          <div class="text-xl font-bold mt-1 text-emerald-600 dark:text-emerald-400 font-mono tabular-nums">
            {{ formatPeso(summaryStats.approvedNetPay) }}
          </div>
          <div class="text-[10px] text-muted-foreground mt-0.5 flex items-center gap-1">
            <span class="font-semibold text-foreground">{{ summaryStats.approvedCount }}</span>
            <span>employees approved</span>
          </div>
        </div>
      </div>

      <!-- Card 3: Returned for Correction -->
      <div class="rounded-xl border bg-card p-3 shadow-xs">
        <div class="text-[11px] font-medium text-muted-foreground flex items-center justify-between">
          <span>Needs Correction</span>
          <RotateCcw class="size-3.5 text-rose-600 dark:text-rose-400" />
        </div>
        <div v-if="isLoading" class="mt-1 space-y-1">
          <Skeleton class="h-6 w-16" />
          <Skeleton class="h-3 w-24" />
        </div>
        <div v-else>
          <div class="text-xl font-bold mt-1 text-foreground font-mono tabular-nums" :class="{ 'text-rose-600 dark:text-rose-400': summaryStats.returnedCount > 0 }">
            {{ summaryStats.returnedCount }}
          </div>
          <div class="text-[10px] text-muted-foreground mt-0.5">
            {{ summaryStats.returnedCount === 0 ? 'No records returned' : 'Requires matrix recalculation' }}
          </div>
        </div>
      </div>

      <!-- Card 4: Total Batch Snapshot Records -->
      <div class="rounded-xl border bg-card p-3 shadow-xs">
        <div class="text-[11px] font-medium text-muted-foreground flex items-center justify-between">
          <span>Total Batch Records</span>
          <Users class="size-3.5 text-blue-600 dark:text-blue-400" />
        </div>
        <div v-if="isLoading" class="mt-1 space-y-1">
          <Skeleton class="h-6 w-16" />
          <Skeleton class="h-3 w-28" />
        </div>
        <div v-else>
          <div class="text-xl font-bold mt-1 text-foreground font-mono tabular-nums">
            {{ summaryStats.totalCount }}
          </div>
          <div class="text-[10px] text-muted-foreground mt-0.5 font-mono tabular-nums">
            Net: {{ formatPeso(summaryStats.totalNetPay) }}
          </div>
        </div>
      </div>
    </div>

    <!-- Search and Filters Toolbar -->
    <div class="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
      <div class="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 flex-1 max-w-2xl">
        <!-- Search Input -->
        <div class="relative flex-1">
          <Search class="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground pointer-events-none" />
          <Input
            v-model="query"
            type="text"
            placeholder="Search by employee name, Bio ID, or employee ID..."
            class="pl-8 pr-8 h-8 text-xs bg-card"
            :disabled="isLoading && snapshots.length === 0"
            @input="onSearchInput"
          />
          <button
            v-if="query"
            type="button"
            class="absolute right-2 top-2 size-4 text-muted-foreground hover:text-foreground flex items-center justify-center transition-colors"
            title="Clear search"
            @click="clearQuery"
          >
            <X class="size-3.5" />
          </button>
        </div>

        <!-- Approval Status Filter -->
        <select
          v-model="statusFilter"
          class="h-8 rounded-md border border-input bg-card px-2.5 text-xs text-foreground font-medium focus:outline-hidden"
          @change="onFilterChange"
        >
          <option value="">All Statuses</option>
          <option value="ready">Pending Review</option>
          <option value="approved">Approved</option>
          <option value="needs_review">Returned for Correction</option>
        </select>

        <!-- Clear all filters button if active -->
        <Button
          v-if="query || statusFilter"
          variant="ghost"
          size="sm"
          class="h-8 text-xs text-muted-foreground hover:text-foreground shrink-0"
          @click="clearAllFilters"
        >
          Reset Filters
        </Button>
      </div>

      <!-- Result Counter Display -->
      <div class="flex items-center gap-2 self-start sm:self-center text-xs text-muted-foreground">
        <template v-if="isLoading">
          <Skeleton class="h-5 w-28 rounded-md" />
        </template>
        <template v-else-if="snapshots.length > 0">
          <span v-if="query.trim() || statusFilter" class="inline-flex items-center gap-1.5 font-medium">
            <span class="text-foreground font-semibold">{{ filtered.length }}</span>
            <span>of</span>
            <span>{{ batchSnapshots.length }} records</span>
            <span class="text-[10px] text-muted-foreground font-normal">(filtered)</span>
          </span>
          <span v-else class="text-muted-foreground">
            Total <strong class="text-foreground">{{ batchSnapshots.length }}</strong> snapshot records
          </span>
        </template>
      </div>
    </div>

    <!-- Employee Payroll Approval Table Container -->
    <div class="rounded-xl border bg-card shadow-xs overflow-hidden">
      <div class="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow class="bg-muted/40">
              <TableHead class="font-semibold text-xs whitespace-nowrap min-w-[70px]">Bio ID</TableHead>
              <TableHead class="font-semibold text-xs whitespace-nowrap min-w-[190px]">Employee</TableHead>
              <TableHead class="font-semibold text-xs whitespace-nowrap min-w-[90px]">Cutoff</TableHead>
              <TableHead class="font-semibold text-xs whitespace-nowrap min-w-[110px]">Base & Days</TableHead>
              <TableHead class="font-semibold text-xs whitespace-nowrap text-right min-w-[100px]">Gross</TableHead>
              <TableHead class="font-semibold text-xs whitespace-nowrap text-right min-w-[100px]">Deductions</TableHead>
              <TableHead class="font-semibold text-xs whitespace-nowrap text-right min-w-[110px]">Net Pay</TableHead>
              <TableHead class="font-semibold text-xs whitespace-nowrap text-center min-w-[120px]">Status</TableHead>
              <TableHead class="font-semibold text-xs whitespace-nowrap text-right min-w-[190px]">Actions</TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            <!-- 1. Skeleton Loading State -->
            <template v-if="isLoading">
              <TableRow v-for="i in 8" :key="`skeleton-row-${i}`" class="text-xs">
                <TableCell><Skeleton class="h-4 w-10" /></TableCell>
                <TableCell>
                  <div class="space-y-1">
                    <Skeleton class="h-4 w-36" />
                    <Skeleton class="h-3 w-24" />
                  </div>
                </TableCell>
                <TableCell><Skeleton class="h-4 w-16" /></TableCell>
                <TableCell>
                  <div class="space-y-1">
                    <Skeleton class="h-4 w-16" />
                    <Skeleton class="h-3 w-12" />
                  </div>
                </TableCell>
                <TableCell class="text-right"><Skeleton class="h-4 w-16 ml-auto" /></TableCell>
                <TableCell class="text-right"><Skeleton class="h-4 w-16 ml-auto" /></TableCell>
                <TableCell class="text-right"><Skeleton class="h-4 w-20 ml-auto" /></TableCell>
                <TableCell class="text-center"><Skeleton class="h-5 w-20 mx-auto rounded-full" /></TableCell>
                <TableCell class="text-right">
                  <div class="flex items-center justify-end gap-1.5">
                    <Skeleton class="h-7 w-12" />
                    <Skeleton class="h-7 w-16" />
                  </div>
                </TableCell>
              </TableRow>
            </template>

            <!-- 2. Empty State: No snapshots exist in the system or period -->
            <TableRow v-else-if="batchSnapshots.length === 0">
              <TableCell :colspan="9" class="h-36 text-center text-xs">
                <div class="flex flex-col items-center justify-center py-6 space-y-2 text-muted-foreground">
                  <FileText class="size-8 text-muted-foreground/50" />
                  <div class="font-medium text-foreground text-sm">No payroll snapshots found for this period</div>
                  <div class="text-[11px] max-w-md">
                    Snapshots are generated and saved when payroll is calculated in the Attendance Matrix.
                    Select another cutoff period or navigate to the Attendance Matrix to calculate payroll.
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    class="h-8 text-xs mt-2"
                    @click="goToAttendanceMatrix"
                  >
                    Open Attendance Matrix
                  </Button>
                </div>
              </TableCell>
            </TableRow>

            <!-- 3. Empty State: Filters yielded 0 results -->
            <TableRow v-else-if="filtered.length === 0">
              <TableCell :colspan="9" class="h-32 text-center text-xs">
                <div class="flex flex-col items-center justify-center py-5 space-y-2 text-muted-foreground">
                  <Search class="size-6 text-muted-foreground/60" />
                  <div class="font-medium text-foreground">
                    No payroll records match the selected filters
                  </div>
                  <div class="text-[11px] max-w-sm">
                    No records matched "{{ query }}" with the current status filter. Try clearing filters.
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    class="h-7 text-xs mt-1"
                    @click="clearAllFilters"
                  >
                    Clear Filters
                  </Button>
                </div>
              </TableCell>
            </TableRow>

            <!-- 4. Rendered Employee Rows -->
            <TableRow
              v-else
              v-for="snap in paginatedRecords"
              :key="snap.id"
              class="text-xs hover:bg-muted/40 transition-colors"
            >
              <!-- Bio ID -->
              <TableCell class="font-mono text-muted-foreground font-medium whitespace-nowrap">
                {{ snap.bioId }}
              </TableCell>

              <!-- Employee Name & Details -->
              <TableCell class="font-medium text-foreground">
                <div class="font-semibold text-foreground truncate max-w-[200px]" :title="snap.employeeName">
                  {{ snap.employeeName }}
                </div>
                <div class="text-[10px] text-muted-foreground truncate max-w-[200px]">
                  ID: {{ snap.employeeNumber || '—' }} • {{ snap.department || 'Operations' }}
                </div>
              </TableCell>

              <!-- Cutoff Period -->
              <TableCell class="whitespace-nowrap font-mono text-[11px] text-muted-foreground">
                {{ snap.periodId }}
              </TableCell>

              <!-- Base & Days -->
              <TableCell class="whitespace-nowrap">
                <div class="font-mono tabular-nums text-foreground">
                  {{ formatPeso(snap.basicSalary) }}
                </div>
                <div class="text-[10px] text-muted-foreground">
                  <span class="font-semibold text-foreground">{{ snap.payableDays ?? '—' }}</span>
                  <span> payable days</span>
                </div>
              </TableCell>

              <!-- Gross Earnings -->
              <TableCell class="font-mono tabular-nums text-right whitespace-nowrap text-foreground">
                {{ formatPeso(snap.initialEarnings) }}
              </TableCell>

              <!-- Total Deductions -->
              <TableCell class="font-mono tabular-nums text-right whitespace-nowrap text-rose-600 dark:text-rose-400">
                -{{ formatPeso(getSnapshotDeductions(snap)) }}
              </TableCell>

              <!-- Net Pay -->
              <TableCell class="font-mono tabular-nums font-bold text-right whitespace-nowrap text-emerald-600 dark:text-emerald-400">
                {{ formatPeso(snap.netPay) }}
              </TableCell>

              <!-- Approval Status Badge -->
              <TableCell class="text-center whitespace-nowrap">
                <Badge :variant="badgeVariant(snap.reviewStatus)" class="text-[10px] font-medium">
                  {{ humanStatus(snap.reviewStatus) }}
                </Badge>
              </TableCell>

              <!-- Actions -->
              <TableCell class="text-right whitespace-nowrap">
                <div class="flex items-center justify-end gap-1.5">
                  <Button
                    size="sm"
                    variant="ghost"
                    class="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
                    title="View detailed breakdown and audit history"
                    @click="openRecord(snap)"
                  >
                    <Eye class="size-3.5 mr-1" />
                    Review
                  </Button>

                  <Button
                    size="sm"
                    variant="default"
                    class="h-7 px-2.5 text-xs gap-1 font-medium bg-blue-600 hover:bg-blue-700 text-white dark:bg-blue-600 dark:hover:bg-blue-700"
                    :disabled="snap.reviewStatus === 'approved' || isSubmitting"
                    title="Authorize and approve payroll"
                    @click="openApproveDialog(snap)"
                  >
                    <Check class="size-3.5" />
                    <span>Approve</span>
                  </Button>

                  <Button
                    size="sm"
                    variant="outline"
                    class="h-7 px-2 text-xs gap-1 text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/30 border-rose-200 dark:border-rose-900/50"
                    :disabled="snap.reviewStatus === 'needs_review' || isSubmitting"
                    title="Return record for matrix recalculation"
                    @click="openReturnDialog(snap)"
                  >
                    <RotateCcw class="size-3" />
                    <span>Return</span>
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>

      <!-- Pagination Footer -->
      <div v-if="!isLoading && filtered.length > 0" class="border-t bg-muted/20 p-2 sm:p-3">
        <Pagination
          :current-page="currentPage"
          :total-pages="totalPages"
          :total-items="filtered.length"
          :page-size="pageSize"
          @update:page="onPageChange"
          @update:page-size="onPageSizeChange"
        />
      </div>
    </div>

    <!-- ================================================================= -->
    <!-- DIALOG 1: Detailed Snapshot Review Modal                          -->
    <!-- ================================================================= -->
    <Dialog :open="isDetailDialogOpen" @update:open="(val: boolean) => isDetailDialogOpen = val">
      <DialogContent class="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader v-if="activeSnap">
          <div class="flex items-start justify-between gap-4">
            <div>
              <DialogTitle class="text-lg font-bold flex items-center gap-2">
                <span>{{ activeSnap.employeeName }}</span>
                <Badge :variant="badgeVariant(activeSnap.reviewStatus)" class="text-[10px]">
                  {{ humanStatus(activeSnap.reviewStatus) }}
                </Badge>
              </DialogTitle>
              <DialogDescription class="text-xs text-muted-foreground mt-1">
                Bio ID: <span class="font-mono font-medium text-foreground">{{ activeSnap.bioId }}</span>
                <span class="mx-1.5">·</span>
                Emp ID: <span class="font-mono font-medium text-foreground">{{ activeSnap.employeeNumber || '—' }}</span>
                <span class="mx-1.5">·</span>
                Dept: <span class="font-medium text-foreground">{{ activeSnap.department || 'Operations' }}</span>
                <span class="mx-1.5">·</span>
                Period: <span class="font-mono font-medium text-foreground">{{ activeSnap.periodId }}</span>
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div v-if="activeSnap" class="space-y-4 py-2 text-xs">
          <!-- Quick 3-Metric Highlight Strip -->
          <div class="grid grid-cols-3 gap-2 p-3 rounded-lg border bg-muted/20">
            <div>
              <div class="text-[10px] text-muted-foreground">Gross Earnings</div>
              <div class="text-base font-bold font-mono tabular-nums text-foreground mt-0.5">
                {{ formatPeso(activeSnap.initialEarnings) }}
              </div>
            </div>
            <div>
              <div class="text-[10px] text-muted-foreground">Total Deductions</div>
              <div class="text-base font-bold font-mono tabular-nums text-rose-600 dark:text-rose-400 mt-0.5">
                -{{ formatPeso(getSnapshotDeductions(activeSnap)) }}
              </div>
            </div>
            <div>
              <div class="text-[10px] text-muted-foreground">Net Pay Disbursement</div>
              <div class="text-base font-bold font-mono tabular-nums text-emerald-600 dark:text-emerald-400 mt-0.5">
                {{ formatPeso(activeSnap.netPay) }}
              </div>
            </div>
          </div>

          <!-- Two-column detailed breakdown -->
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <!-- Left: Compensation & Deductions -->
            <div class="space-y-3.5">
              <!-- Earnings breakdown -->
              <div class="rounded-lg border p-3 bg-card">
                <div class="font-semibold text-foreground text-xs pb-1.5 border-b mb-2 flex items-center justify-between">
                  <span>Earnings Breakdown</span>
                  <span class="text-[10px] font-normal text-muted-foreground font-mono">
                    {{ activeSnap.salaryType || 'Standard' }}
                  </span>
                </div>
                <div class="space-y-1.5">
                  <div class="flex justify-between items-center text-muted-foreground">
                    <span>Base Salary / Rate</span>
                    <span class="font-mono tabular-nums text-foreground">₱{{ activeSnap.basicSalaryDisplay }}</span>
                  </div>
                  <div class="flex justify-between items-center text-muted-foreground">
                    <span>Payable Days</span>
                    <span class="font-mono tabular-nums text-foreground">{{ activeSnap.payableDays ?? '—' }} days</span>
                  </div>
                  <div class="flex justify-between items-center text-muted-foreground">
                    <span>Holiday Pay</span>
                    <span class="font-mono tabular-nums text-foreground">{{ formatPeso(activeSnap.holidayPay) }}</span>
                  </div>
                  <div class="flex justify-between items-center text-muted-foreground">
                    <span>Authorized Overtime</span>
                    <span class="font-mono tabular-nums text-foreground">
                      {{ formatPeso(activeSnap.overtimePay) }}
                      <span v-if="activeSnap.overtimeHours" class="text-[10px] text-muted-foreground">({{ activeSnap.overtimeHours }}h)</span>
                    </span>
                  </div>
                  <div class="flex justify-between items-center pt-1.5 border-t font-semibold text-foreground">
                    <span>Gross Earnings</span>
                    <span class="font-mono tabular-nums">{{ formatPeso(activeSnap.initialEarnings) }}</span>
                  </div>
                </div>
              </div>

              <!-- Deductions breakdown -->
              <div class="rounded-lg border p-3 bg-card">
                <div class="font-semibold text-foreground text-xs pb-1.5 border-b mb-2">
                  Deductions & Advances
                </div>
                <div class="space-y-1.5">
                  <div class="flex justify-between items-center text-muted-foreground">
                    <span>SSS Contribution</span>
                    <span class="font-mono tabular-nums text-foreground">{{ formatPeso(activeSnap.sss) }}</span>
                  </div>
                  <div class="flex justify-between items-center text-muted-foreground">
                    <span>PhilHealth</span>
                    <span class="font-mono tabular-nums text-foreground">{{ formatPeso(activeSnap.philhealth) }}</span>
                  </div>
                  <div class="flex justify-between items-center text-muted-foreground">
                    <span>Pag-IBIG</span>
                    <span class="font-mono tabular-nums text-foreground">{{ formatPeso(activeSnap.pagibig) }}</span>
                  </div>
                  <div v-if="Number(activeSnap.sssLoan || 0) > 0 || Number(activeSnap.pagibigLoan || 0) > 0 || Number(activeSnap.otherLoan || 0) > 0" class="flex justify-between items-center text-muted-foreground">
                    <span>Government / Company Loans</span>
                    <span class="font-mono tabular-nums text-foreground">
                      {{ formatPeso(Number(activeSnap.sssLoan || 0) + Number(activeSnap.pagibigLoan || 0) + Number(activeSnap.otherLoan || 0)) }}
                    </span>
                  </div>
                  <div v-if="Number(activeSnap.cashAdvance || 0) > 0" class="flex justify-between items-center text-muted-foreground">
                    <span>Cash Advance</span>
                    <span class="font-mono tabular-nums text-foreground">{{ formatPeso(activeSnap.cashAdvance) }}</span>
                  </div>
                  <!-- Itemized deductions list -->
                  <template v-if="(activeSnap.itemizedDeductions || []).length > 0">
                    <div v-for="d in activeSnap.itemizedDeductions" :key="d.id" class="flex justify-between items-center text-muted-foreground">
                      <span class="truncate max-w-[170px]" :title="d.description">{{ d.description }}</span>
                      <span class="font-mono tabular-nums text-foreground">{{ formatPeso(d.amount) }}</span>
                    </div>
                  </template>
                  <div class="flex justify-between items-center pt-1.5 border-t font-semibold text-rose-600 dark:text-rose-400">
                    <span>Total Deductions</span>
                    <span class="font-mono tabular-nums">-{{ formatPeso(getSnapshotDeductions(activeSnap)) }}</span>
                  </div>
                </div>
              </div>
            </div>

            <!-- Right: Review Details & Audit Trail -->
            <div class="space-y-3.5">
              <!-- Review Metadata -->
              <div class="rounded-lg border p-3 bg-card">
                <div class="font-semibold text-foreground text-xs pb-1.5 border-b mb-2">
                  Review & Approval Information
                </div>
                <div class="space-y-2">
                  <div class="flex justify-between items-center">
                    <span class="text-muted-foreground">Current Status</span>
                    <Badge :variant="badgeVariant(activeSnap.reviewStatus)" class="text-[10px]">
                      {{ humanStatus(activeSnap.reviewStatus) }}
                    </Badge>
                  </div>
                  <div v-if="activeSnap.approvedBy" class="flex justify-between items-center">
                    <span class="text-muted-foreground">Approved By</span>
                    <span class="font-medium text-foreground">{{ activeSnap.approvedBy }}</span>
                  </div>
                  <div v-if="activeSnap.approvedAt" class="flex justify-between items-center">
                    <span class="text-muted-foreground">Approved At</span>
                    <span class="font-mono text-muted-foreground">{{ formatDate(activeSnap.approvedAt) }}</span>
                  </div>
                  <div class="flex justify-between items-center">
                    <span class="text-muted-foreground">Target Payday</span>
                    <span class="font-mono text-muted-foreground">{{ activeSnap.payday || 'Scheduled Payday' }}</span>
                  </div>
                </div>
              </div>

              <!-- Audit Trail History -->
              <div class="rounded-lg border p-3 bg-card">
                <div class="font-semibold text-foreground text-xs pb-1.5 border-b mb-2 flex items-center justify-between">
                  <span>Approval History & Audit Trail</span>
                  <span class="text-[10px] text-muted-foreground">
                    {{ (activeSnap.reviewReasons || []).length }} entries
                  </span>
                </div>
                <div class="space-y-2 max-h-48 overflow-y-auto pr-1">
                  <div v-if="(activeSnap.reviewReasons || []).length === 0" class="text-xs text-muted-foreground py-2 text-center">
                    No review history recorded yet.
                  </div>
                  <div
                    v-else
                    v-for="(r, idx) in activeSnap.reviewReasons"
                    :key="idx"
                    class="p-2 rounded bg-muted/30 border border-border/50 text-[11px] leading-relaxed"
                  >
                    <div class="text-foreground">{{ r }}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter v-if="activeSnap" class="flex items-center justify-between sm:justify-between border-t pt-3">
          <Button variant="outline" size="sm" @click="isDetailDialogOpen = false">
            Close
          </Button>

          <div class="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              class="text-rose-600 hover:text-rose-700 hover:bg-rose-50 border-rose-200 dark:border-rose-900/50"
              :disabled="activeSnap.reviewStatus === 'needs_review' || isSubmitting"
              @click="openReturnFromDetail"
            >
              <RotateCcw class="size-3.5 mr-1" />
              Return for Correction
            </Button>

            <Button
              variant="default"
              size="sm"
              class="bg-blue-600 hover:bg-blue-700 text-white dark:bg-blue-600 dark:hover:bg-blue-700"
              :disabled="activeSnap.reviewStatus === 'approved' || isSubmitting"
              @click="openApproveFromDetail"
            >
              <Check class="size-3.5 mr-1" />
              Approve Payroll
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <!-- ================================================================= -->
    <!-- DIALOG 2: Confirm Approval Modal                                  -->
    <!-- ================================================================= -->
    <Dialog :open="isApproveDialogOpen" @update:open="(val: boolean) => isApproveDialogOpen = val">
      <DialogContent class="max-w-md">
        <DialogHeader>
          <DialogTitle class="text-base font-bold flex items-center gap-2 text-foreground">
            <ShieldCheck class="size-5 text-blue-600 dark:text-blue-400" />
            <span>Confirm Payroll Approval</span>
          </DialogTitle>
          <DialogDescription class="text-xs text-muted-foreground">
            You are authorizing payroll release for this employee. This action records your name and timestamp in the audit trail.
          </DialogDescription>
        </DialogHeader>

        <div v-if="targetForApprove" class="space-y-3 py-2 text-xs">
          <div class="p-3 rounded-lg border bg-muted/20 space-y-1.5">
            <div class="flex justify-between">
              <span class="text-muted-foreground">Employee</span>
              <span class="font-semibold text-foreground">{{ targetForApprove.employeeName }}</span>
            </div>
            <div class="flex justify-between">
              <span class="text-muted-foreground">Bio ID / Emp ID</span>
              <span class="font-mono text-muted-foreground">{{ targetForApprove.bioId }} / {{ targetForApprove.employeeNumber || '—' }}</span>
            </div>
            <div class="flex justify-between">
              <span class="text-muted-foreground">Cutoff Period</span>
              <span class="font-mono text-muted-foreground">{{ targetForApprove.periodId }}</span>
            </div>
            <div class="flex justify-between items-center pt-2 border-t font-semibold">
              <span class="text-foreground">Net Pay Authorization</span>
              <span class="font-mono text-base font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
                {{ formatPeso(targetForApprove.netPay) }}
              </span>
            </div>
          </div>
        </div>

        <DialogFooter class="flex items-center justify-end gap-2 border-t pt-3">
          <Button
            variant="outline"
            size="sm"
            :disabled="isSubmitting"
            @click="isApproveDialogOpen = false"
          >
            Cancel
          </Button>
          <Button
            variant="default"
            size="sm"
            class="bg-blue-600 hover:bg-blue-700 text-white dark:bg-blue-600 dark:hover:bg-blue-700"
            :disabled="isSubmitting"
            @click="handleConfirmApprove"
          >
            <RefreshCw v-if="isSubmitting" class="size-3.5 mr-1.5 animate-spin" />
            <Check v-else class="size-3.5 mr-1.5" />
            <span>Confirm Approval</span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <!-- ================================================================= -->
    <!-- DIALOG 3: Return for Correction Modal                             -->
    <!-- ================================================================= -->
    <Dialog :open="isReturnDialogOpen" @update:open="(val: boolean) => isReturnDialogOpen = val">
      <DialogContent class="max-w-md">
        <DialogHeader>
          <DialogTitle class="text-base font-bold flex items-center gap-2 text-foreground">
            <RotateCcw class="size-5 text-rose-600 dark:text-rose-400" />
            <span>Return Payroll for Correction</span>
          </DialogTitle>
          <DialogDescription class="text-xs text-muted-foreground">
            Please provide a specific reason so the payroll and attendance officer knows what revisions or recalculations are required.
          </DialogDescription>
        </DialogHeader>

        <div v-if="targetForReturn" class="space-y-3 py-2 text-xs">
          <div class="p-2.5 rounded-lg border bg-muted/20">
            <div class="font-semibold text-foreground">{{ targetForReturn.employeeName }}</div>
            <div class="text-[11px] text-muted-foreground font-mono">
              Bio ID: {{ targetForReturn.bioId }} · Period: {{ targetForReturn.periodId }}
            </div>
          </div>

          <div class="space-y-1.5">
            <label class="font-medium text-foreground text-xs flex items-center justify-between">
              <span>Reason for Return <span class="text-destructive">*</span></span>
              <span class="text-[10px] text-muted-foreground">{{ returnReason.length }}/200 chars</span>
            </label>
            <Textarea
              v-model="returnReason"
              rows="3"
              maxlength="200"
              placeholder="e.g., Unverified 2.0 hrs overtime on June 12; please check signed OT authorization form with operations head..."
              class="text-xs"
              :class="{ 'border-destructive focus-visible:ring-destructive': returnReasonError }"
              @input="returnReasonError = ''"
            />
            <p v-if="returnReasonError" class="text-[11px] text-destructive">
              {{ returnReasonError }}
            </p>
          </div>
        </div>

        <DialogFooter class="flex items-center justify-end gap-2 border-t pt-3">
          <Button
            variant="outline"
            size="sm"
            :disabled="isSubmitting"
            @click="isReturnDialogOpen = false"
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            size="sm"
            :disabled="!returnReason.trim() || isSubmitting"
            @click="handleConfirmReturn"
          >
            <RefreshCw v-if="isSubmitting" class="size-3.5 mr-1.5 animate-spin" />
            <RotateCcw v-else class="size-3.5 mr-1.5" />
            <span>Return for Correction</span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import {
  Search,
  X,
  RefreshCw,
  CheckCircle2,
  Clock,
  RotateCcw,
  AlertCircle,
  Users,
  Check,
  Eye,
  FileText,
  ShieldCheck
} from '@lucide/vue'
import { db, type PayrollSnapshotRecord } from '@/db'
import { payrollCalculationService, type EmployeePayrollRecord } from '@/services/payrollCalculation'
import { authService } from '@/services/auth'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Pagination } from '@/components/ui/pagination'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'

export interface PayrollApprovalDetailRecord extends EmployeePayrollRecord {
  basicSalaryDisplay: string
  holidayPay: number
  approvedBy?: string
  approvedAt?: string
}

const router = useRouter()

// Cutoffs list
const cutoffs = payrollCalculationService.getAvailableCutoffs(new Date(), 24)
const selectedPeriod = ref('')
const statusFilter = ref('')
const query = ref('')

// Raw snapshots loaded from IndexedDB
const snapshots = ref<PayrollSnapshotRecord[]>([])
const isLoading = ref(true)
const loadError = ref<string | null>(null)

// Pagination state
const currentPage = ref(1)
const pageSize = ref(25)

// Modal state
const activeSnap = ref<PayrollApprovalDetailRecord | null>(null)
const isDetailDialogOpen = ref(false)

const targetForApprove = ref<PayrollSnapshotRecord | null>(null)
const isApproveDialogOpen = ref(false)

const targetForReturn = ref<PayrollSnapshotRecord | null>(null)
const isReturnDialogOpen = ref(false)
const returnReason = ref('')
const returnReasonError = ref('')

const isSubmitting = ref(false)

// Action toast feedback banner
const actionNotice = ref<{ type: 'success' | 'info'; message: string } | null>(null)
let noticeTimer: any = null

function showNotice(type: 'success' | 'info', message: string) {
  actionNotice.value = { type, message }
  if (noticeTimer) clearTimeout(noticeTimer)
  noticeTimer = setTimeout(() => {
    actionNotice.value = null
  }, 4000)
}

// Reviewer Information
const reviewerName = authService.currentUser.value?.name || authService.currentUser.value?.username || 'Reviewer'
const reviewerRole = authService.currentUser.value?.role || 'HR'
const reviewerInitials = (reviewerName || 'HR')
  .split(' ')
  .map(s => s[0])
  .slice(0, 2)
  .join('')
  .toUpperCase()

// Helper formatters
function formatPeso(val: number | undefined | null): string {
  if (val === undefined || val === null || isNaN(val)) return '₱0.00'
  return '₱' + Number(val).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function formatDate(s?: string): string {
  if (!s) return '—'
  try {
    const d = new Date(s)
    if (isNaN(d.getTime())) return s
    return d.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    })
  } catch {
    return s
  }
}

function humanStatus(s: string | undefined): string {
  if (!s) return 'Pending Review'
  if (s === 'ready') return 'Pending Review'
  if (s === 'needs_review') return 'Needs Correction'
  if (s === 'approved') return 'Approved'
  if (s === 'finalized') return 'Finalized'
  return s
}

function badgeVariant(s: string | undefined): 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning' {
  if (s === 'approved' || s === 'finalized') return 'success'
  if (s === 'needs_review') return 'warning'
  return 'outline'
}

function getSnapshotDeductions(snap: PayrollSnapshotRecord | EmployeePayrollRecord): number {
  const benefits = Number(snap.totalBenefitsAndLoans || 0)
  const other = Number(snap.totalOtherDeductions || 0)
  const ca = Number(snap.cashAdvance || 0)
  return benefits + other + ca
}

// Data loading
async function loadSnapshots() {
  isLoading.value = true
  loadError.value = null
  try {
    const list = await db.payrollSnapshots.toArray()
    snapshots.value = list
  } catch (err: any) {
    console.error('Failed to load payroll snapshots:', err)
    loadError.value = err?.message || 'Failed to load payroll snapshots from database.'
  } finally {
    isLoading.value = false
  }
}

onMounted(() => {
  loadSnapshots()
})

function reload() {
  loadSnapshots()
}

function goToAttendanceMatrix() {
  router.push('/payroll/attendance-matrix')
}

// Current batch of snapshots for the selected period
const batchSnapshots = computed(() => {
  if (!selectedPeriod.value) return snapshots.value
  return snapshots.value.filter(s => s.periodId === selectedPeriod.value)
})

// Summary KPI statistics computed over the active batch
const summaryStats = computed(() => {
  const batch = batchSnapshots.value
  const totalCount = batch.length
  const totalNetPay = batch.reduce((sum, s) => sum + (Number(s.netPay) || 0), 0)

  const pending = batch.filter(s => !s.reviewStatus || s.reviewStatus === 'ready')
  const pendingCount = pending.length
  const pendingNetPay = pending.reduce((sum, s) => sum + (Number(s.netPay) || 0), 0)

  const approved = batch.filter(s => s.reviewStatus === 'approved' || s.reviewStatus === 'finalized')
  const approvedCount = approved.length
  const approvedNetPay = approved.reduce((sum, s) => sum + (Number(s.netPay) || 0), 0)

  const returned = batch.filter(s => s.reviewStatus === 'needs_review')
  const returnedCount = returned.length

  return {
    totalCount,
    totalNetPay,
    pendingCount,
    pendingNetPay,
    approvedCount,
    approvedNetPay,
    returnedCount
  }
})

// Filtered list according to search query and approval status
const filtered = computed(() => {
  return batchSnapshots.value
    .filter(snap => {
      if (statusFilter.value) {
        const currentStatus = snap.reviewStatus || 'ready'
        if (currentStatus !== statusFilter.value) return false
      }
      if (query.value.trim()) {
        const q = query.value.trim().toLowerCase()
        const nameMatch = (snap.employeeName || '').toLowerCase().includes(q)
        const empNumMatch = String(snap.employeeNumber || '').toLowerCase().includes(q)
        const bioMatch = String(snap.bioId || '').toLowerCase().includes(q)
        const deptMatch = String(snap.department || '').toLowerCase().includes(q)
        if (!nameMatch && !empNumMatch && !bioMatch && !deptMatch) return false
      }
      return true
    })
    .sort((a, b) => (a.employeeName || '').localeCompare(b.employeeName || ''))
})

// Pagination logic
const totalPages = computed(() => {
  return Math.ceil(filtered.value.length / pageSize.value) || 1
})

const paginatedRecords = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value
  return filtered.value.slice(start, start + pageSize.value)
})

function onPeriodChange() {
  currentPage.value = 1
}

function onFilterChange() {
  currentPage.value = 1
}

function onSearchInput() {
  currentPage.value = 1
}

function clearQuery() {
  query.value = ''
  currentPage.value = 1
}

function clearAllFilters() {
  query.value = ''
  statusFilter.value = ''
  currentPage.value = 1
}

function onPageChange(page: number) {
  currentPage.value = page
}

function onPageSizeChange(size: number) {
  pageSize.value = size
  currentPage.value = 1
}

// Modal inspection handler
function openRecord(snap: PayrollSnapshotRecord) {
  const rec = payrollCalculationService.snapshotToPayrollRecord(snap)
  const holidayPay = snap.holidayPay ?? rec.earningsBreakdown?.holidayPay ?? 0
  activeSnap.value = {
    ...snap,
    ...rec,
    basicSalaryDisplay: (snap.basicSalary || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    holidayPay,
    overtimePay: snap.overtimePay ?? rec.overtimePay ?? 0,
    itemizedDeductions: snap.itemizedDeductions || [],
    totalOtherDeductions: snap.totalOtherDeductions || 0,
    approvedBy: snap.approvedBy,
    approvedAt: snap.approvedAt
  }
  isDetailDialogOpen.value = true
}

// Actions from inside the Detail dialog
function openApproveFromDetail() {
  if (!activeSnap.value) return
  const raw = snapshots.value.find(s => s.id === activeSnap.value?.id)
  if (raw) {
    openApproveDialog(raw)
  }
}

function openReturnFromDetail() {
  if (!activeSnap.value) return
  const raw = snapshots.value.find(s => s.id === activeSnap.value?.id)
  if (raw) {
    openReturnDialog(raw)
  }
}

// Approval flow
function openApproveDialog(snap: PayrollSnapshotRecord) {
  targetForApprove.value = snap
  isApproveDialogOpen.value = true
}

async function handleConfirmApprove() {
  if (!targetForApprove.value) return
  isSubmitting.value = true
  try {
    const snap = targetForApprove.value
    const user = authService.currentUser.value
    const approvedBy = user?.name || user?.username || 'Reviewer'
    const approvedAt = new Date().toISOString()
    const reasons = Array.isArray(snap.reviewReasons) ? [...snap.reviewReasons] : []
    reasons.push(`Approved by ${approvedBy} at ${new Date(approvedAt).toLocaleString()}`)

    await db.payrollSnapshots.update(snap.id, {
      reviewStatus: 'approved',
      approvedBy,
      approvedAt,
      reviewReasons: reasons
    })

    showNotice('success', `Approved payroll for ${snap.employeeName} (${formatPeso(snap.netPay)})`)

    await loadSnapshots()

    if (activeSnap.value && activeSnap.value.id === snap.id) {
      activeSnap.value.reviewStatus = 'approved'
      activeSnap.value.approvedBy = approvedBy
      activeSnap.value.approvedAt = approvedAt
      activeSnap.value.reviewReasons = reasons
    }

    isApproveDialogOpen.value = false
    targetForApprove.value = null
  } catch (err: any) {
    console.error('Failed to approve snapshot:', err)
    showNotice('info', `Failed to approve record: ${err?.message || 'Database error'}`)
  } finally {
    isSubmitting.value = false
  }
}

// Return flow
function openReturnDialog(snap: PayrollSnapshotRecord) {
  targetForReturn.value = snap
  returnReason.value = ''
  returnReasonError.value = ''
  isReturnDialogOpen.value = true
}

async function handleConfirmReturn() {
  if (!targetForReturn.value) return
  const trimmed = returnReason.value.trim()
  if (!trimmed) {
    returnReasonError.value = 'Please provide a reason for returning this record for correction.'
    return
  }

  isSubmitting.value = true
  try {
    const snap = targetForReturn.value
    const user = authService.currentUser.value
    const reviewer = user?.name || user?.username || 'Reviewer'
    const timestamp = new Date().toLocaleString()
    const reasons = Array.isArray(snap.reviewReasons) ? [...snap.reviewReasons] : []
    reasons.push(`Returned by ${reviewer} on ${timestamp}: ${trimmed}`)

    await db.payrollSnapshots.update(snap.id, {
      reviewStatus: 'needs_review',
      reviewReasons: reasons
    })

    showNotice('info', `Returned payroll for ${snap.employeeName} for correction.`)

    await loadSnapshots()

    if (activeSnap.value && activeSnap.value.id === snap.id) {
      activeSnap.value.reviewStatus = 'needs_review'
      activeSnap.value.reviewReasons = reasons
    }

    isReturnDialogOpen.value = false
    targetForReturn.value = null
    returnReason.value = ''
  } catch (err: any) {
    console.error('Failed to return snapshot:', err)
    showNotice('info', `Failed to return record: ${err?.message || 'Database error'}`)
  } finally {
    isSubmitting.value = false
  }
}
</script>
