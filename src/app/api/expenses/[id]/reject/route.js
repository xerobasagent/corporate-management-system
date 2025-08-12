import sql from '@/app/api/utils/sql';
import { requireAuth, PERMISSIONS } from '@/app/api/utils/auth';

// POST /api/expenses/[id]/reject - Reject expense
export async function POST(request, { params }) {
  const user = await requireAuth(request, PERMISSIONS.APPROVE_EXPENSES);
  if (user instanceof Response) return user; // Auth failed
  
  try {
    const { id } = params;
    const data = await request.json();
    
    if (!id) {
      return Response.json(
        { error: 'Expense ID is required' },
        { status: 400 }
      );
    }
    
    const { reason } = data;
    
    if (!reason || reason.trim().length === 0) {
      return Response.json(
        { error: 'Rejection reason is required' },
        { status: 400 }
      );
    }
    
    // Check if expense exists and is pending
    const expenses = await sql`
      SELECT id, status, user_id, amount, category, description, card_id
      FROM expenses 
      WHERE id = ${id}
    `;
    
    if (expenses.length === 0) {
      return Response.json(
        { error: 'Expense not found' },
        { status: 404 }
      );
    }
    
    const expense = expenses[0];
    
    if (expense.status !== 'pending') {
      return Response.json(
        { error: 'Only pending expenses can be rejected' },
        { status: 400 }
      );
    }
    
    // Reject the expense
    const rejectedExpenses = await sql`
      UPDATE expenses 
      SET 
        status = 'rejected',
        approved_by = ${user.id},
        approved_at = NOW(),
        rejection_reason = ${reason.trim()},
        updated_at = NOW()
      WHERE id = ${id}
      RETURNING id, status, approved_at, rejection_reason
    `;
    
    const rejectedExpense = rejectedExpenses[0];
    
    // Update card spend (subtract rejected amount)
    if (expense.card_id) {
      await sql`
        UPDATE corporate_cards 
        SET current_month_spend = current_month_spend - ${expense.amount}
        WHERE id = ${expense.card_id}
      `;
    }
    
    // Get expense details for response
    const expenseDetails = await sql`
      SELECT 
        e.id, e.expense_date, e.amount, e.category, e.description,
        e.status, e.approved_at, e.rejection_reason,
        u.first_name, u.last_name, u.email
      FROM expenses e
      JOIN users u ON e.user_id = u.id
      WHERE e.id = ${id}
    `;
    
    const details = expenseDetails[0];
    
    return Response.json({
      expense: {
        id: details.id,
        date: details.expense_date,
        amount: parseFloat(details.amount),
        category: details.category,
        description: details.description,
        status: details.status,
        approvedAt: details.approved_at,
        rejectionReason: details.rejection_reason,
        user: {
          firstName: details.first_name,
          lastName: details.last_name,
          email: details.email,
          fullName: `${details.first_name} ${details.last_name}`
        },
        approver: {
          firstName: user.firstName,
          lastName: user.lastName,
          fullName: user.fullName
        }
      },
      message: 'Expense rejected successfully'
    });
    
  } catch (error) {
    console.error('Reject expense error:', error);
    return Response.json(
      { error: 'Failed to reject expense' },
      { status: 500 }
    );
  }
}