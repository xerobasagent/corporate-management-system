import sql from '@/app/api/utils/sql';
import { requireAuth, PERMISSIONS } from '@/app/api/utils/auth';

// POST /api/expenses/[id]/approve - Approve expense
export async function POST(request, { params }) {
  const user = await requireAuth(request, PERMISSIONS.APPROVE_EXPENSES);
  if (user instanceof Response) return user; // Auth failed
  
  try {
    const { id } = params;
    
    if (!id) {
      return Response.json(
        { error: 'Expense ID is required' },
        { status: 400 }
      );
    }
    
    // Check if expense exists and is pending
    const expenses = await sql`
      SELECT id, status, user_id, amount, category, description
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
        { error: 'Only pending expenses can be approved' },
        { status: 400 }
      );
    }
    
    // Approve the expense
    const approvedExpenses = await sql`
      UPDATE expenses 
      SET 
        status = 'approved',
        approved_by = ${user.id},
        approved_at = NOW(),
        updated_at = NOW()
      WHERE id = ${id}
      RETURNING id, status, approved_at
    `;
    
    const approvedExpense = approvedExpenses[0];
    
    // Get expense details for response
    const expenseDetails = await sql`
      SELECT 
        e.id, e.expense_date, e.amount, e.category, e.description,
        e.status, e.approved_at,
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
      message: 'Expense approved successfully'
    });
    
  } catch (error) {
    console.error('Approve expense error:', error);
    return Response.json(
      { error: 'Failed to approve expense' },
      { status: 500 }
    );
  }
}