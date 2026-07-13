import React, { useCallback, useState } from 'react';
import TimesheetModule, { TimesheetModuleProps } from '../expenses/TimesheetModule';
import { PAYROLL_OFFICE_COLOR, PAYROLL_OFFICE_KEY, PAYROLL_OFFICE_LABEL, PayrollSchoolTab, TimesheetPayrollSummary } from '../expenses/timesheetTypes';
import PayrollOverview from './PayrollOverview';
import PayrollSchoolKpiStrip from './PayrollSchoolKpiStrip';
import PayrollTransferDashboard from './PayrollTransferDashboard';

interface PayrollModuleProps extends TimesheetModuleProps {
  schoolKey: string | null;
  transferFilter: string;
  schoolTab: PayrollSchoolTab;
  onSelectSchool: (key: string) => void;
  onTransferFilterChange: (key: string) => void;
}

export default function PayrollModule({ schoolKey, transferFilter, schoolTab, onSelectSchool, onTransferFilterChange, ...props }: PayrollModuleProps) {
  const rightReserveWidth = props.rightReserveWidth ?? 78;
  const [summaryBySchool, setSummaryBySchool] = useState<Record<string, TimesheetPayrollSummary>>({});

  const handleSummaryChange = useCallback((summary: TimesheetPayrollSummary) => {
    if (!schoolKey) return;
    setSummaryBySchool(prev => {
      const current = prev[schoolKey];
      if (
        current
        && current.accruedAmount === summary.accruedAmount
        && current.advanceAmount === summary.advanceAmount
        && current.salaryAmount === summary.salaryAmount
        && current.paidAmount === summary.paidAmount
        && current.remainingAmount === summary.remainingAmount
      ) {
        return prev;
      }
      return { ...prev, [schoolKey]: summary };
    });
  }, [schoolKey]);

  if (!schoolKey) {
    return (
      <PayrollOverview
        onSelectSchool={onSelectSchool}
        onSidebarWidthChange={props.onSchoolsSidebarWidthChange}
        summaryBySchool={summaryBySchool}
      />
    );
  }

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
        <TimesheetModule
          {...props}
          initialSchoolKey={schoolKey}
          externalQuickTransfer={transferFilter}
          onSchoolKeyChange={onSelectSchool}
          onPayrollSummaryChange={handleSummaryChange}
          payrollSchoolTab={schoolTab}
          extraSchoolDockItems={[{
            key: PAYROLL_OFFICE_KEY,
            label: PAYROLL_OFFICE_LABEL,
            color: PAYROLL_OFFICE_COLOR,
            active: schoolKey === PAYROLL_OFFICE_KEY,
          }]}
          renderPayrollHeader={({ calculator }) => (
            <>
              <PayrollSchoolKpiStrip
                schoolKey={schoolKey}
                rightReserveWidth={rightReserveWidth}
                summaryBySchool={summaryBySchool}
                leadingContent={schoolTab === 'timesheet' ? calculator : undefined}
              />
              <PayrollTransferDashboard
                schoolKey={schoolKey}
                rightReserveWidth={rightReserveWidth}
                selectedKey={transferFilter}
                onSelect={onTransferFilterChange}
              />
            </>
          )}
          hideHeaderControls
        />
      </div>
    </div>
  );
}
