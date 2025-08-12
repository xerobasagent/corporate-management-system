import sql from '@/app/api/utils/sql';
import { requireAuth, PERMISSIONS, hasRole } from '@/app/api/utils/auth';

// GET /api/expenses - List expenses with role-based filtering
export async function GET(request) {
  const user = await requireAuth(request, PERMISSIONS.SUBMIT_EXPENSES);
  if (user instanceof Response) return user; // Auth failed
  
  try {
    const url = new URL(request.url);
    const page = parseInt(url.searchParams.get('page')) || 1;
    const limit = parseInt(url.searchParams.get('limit')) || 50;
    const status = url.searchParams.get('status');
    const startDate = url.searchParams.get('startDate');
    const endDate = url.searchParams.get('endDate');
    const category = url.searchParams.get('category');
    const userId = url.searchParams.get('userId');
    
    const offset = (page - 1) * limit;
    
    // Build dynamic query
    let whereClause = 'WHERE 1=1';
    const params = [];
    let paramIndex = 1;
    
    // Role-based filtering
    if (!hasRole(user, PERMISSIONS.VIEW_ALL_EXPENSES)) {
      // Employees can only see their own expenses
      whereClause += ` AND e.user_id = $${paramIndex}`;
      params.push(user.id);
      paramIndex++;
    } else if (userId) {
      // Admins/Managers/Accountants can filter by user
      whereClause += ` AND e.user_id = $${paramIndex}`;
      params.push(userId);
      paramIndex++;
    }
    
    // Status filter
    if (status) {
      whereClause += ` AND e.status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }
    
    // Date range filter
    if (startDate) {
      whereClause += ` AND e.expense_date >= $${paramIndex}`;
      params.push(startDate);
      paramIndex++;
    }
    
    if (endDate) {
      whereClause += ` AND e.expense_date <= $${paramIndex}`;
      params.push(endDate);
      paramIndex++;
    }
    
    // Category filter
    if (category) {
      whereClause += ` AND e.category = $${paramIndex}`;
      params.push(category);
      paramIndex++;
    }
    
    // Get expenses with user and card info
    const query = `
      SELECT 
        e.id, e.expense_date, e.amount, e.category, e.description, 
        e.receipt_url, e.status, e.approved_at, e.rejection_reason,
        e.created_at, e.updated_at,
        u.first_name, u.last_name, u.email, u.employee_id,
        c.card_name, c.last_four_digits,
        approver.first_name as approver_first_name,
        approver.last_name as approver_last_name
      FROM expenses e
      JOIN users u ON e.user_id = u.id
      LEFT JOIN corporate_cards c ON e.card_id = c.id
      LEFT JOIN users approver ON e.approved_by = approver.id
      ${whereClause}
      ORDER BY e.created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;
    
    params.push(limit, offset);
    
    const expenses = await sql(query, params);
    
    // Get total count for pagination
    const countQuery = `
      SELECT COUNT(*) as total
      FROM expenses e
      JOIN users u ON e.user_id = u.id
      ${whereClause}
    `;
    
    const countResult = await sql(countQuery, params.slice(0, -2)); // Remove limit and offset
    const total = parseInt(countResult[0].total);
    
    // Format response
    const formattedExpenses = expenses.map(expense => ({
      id: expense.id,
      date: expense.expense_date,
      amount: parseFloat(expense.amount),
      category: expense.category,
      description: expense.description,
      receiptUrl: expense.receipt_url,
      status: expense.status,
      approvedAt: expense.approved_at,
      rejectionReason: expense.rejection_reason,
      createdAt: expense.created_at,
      updatedAt: expense.updated_at,
      user: {
        firstName: expense.first_name,
        lastName: expense.last_name,
        email: expense.email,
        employeeId: expense.employee_id,
        fullName: `${expense.first_name} ${expense.last_name}`
      },
      card: expense.card_name ? {
        name: expense.card_name,
        lastFour: expense.last_four_digits
      } : null,
      approver: expense.approver_first_name ? {
        firstName: expense.approver_first_name,
        lastName: expense.approver_last_name,
        fullName: `${expense.approver_first_name} ${expense.approver_last_name}`
      } : null
    }));
    
    return Response.json({
      expenses: formattedExpenses,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
    
  } catch (error) {
    console.error('Get expenses error:', error);
    return Response.json(
      { error: 'Failed to fetch expenses' },
      { status: 500 }
    );
  }
}

// POST /api/expenses - Create new expense
export async function POST(request) {
  const user = await requireAuth(request, PERMISSIONS.SUBMIT_EXPENSES);
  if (user instanceof Response) return user; // Auth failed
  
  try {
    const data = await request.json();
    
    // Validate required fields
    const { date, amount, category, description, receiptUrl, cardId } = data;
    
    if (!date || !amount || !category || !description) {
      return Response.json(
        { error: 'Date, amount, category, and description are required' },
        { status: 400 }
      );
    }
    
    if (amount <= 0) {
      return Response.json(
        { error: 'Amount must be greater than 0' },
        { status: 400 }
      );
    }
    
    // Verify card belongs to user (if specified)
    if (cardId) {
      const cards = await sql`
        SELECT id FROM corporate_cards 
        WHERE id = ${cardId} 
        AND (assigned_to = ${user.id} OR ${hasRole(user, ['admin'])})
        AND is_active = true
      `;
      
      if (cards.length === 0) {
        return Response.json(
          { error: 'Invalid or unauthorized card' },
          { status: 400 }
        );
      }
    }
    
    // Create expense
    const expenses = await sql`
      INSERT INTO expenses (user_id, card_id, expense_date, amount, category, description, receipt_url)
      VALUES (${user.id}, ${cardId || null}, ${date}, ${amount}, ${category}, ${description}, ${receiptUrl || null})
      RETURNING id, expense_date, amount, category, description, receipt_url, status, created_at
    `;
    
    const expense = expenses[0];
    
    // Update card spend if applicable
    if (cardId) {
      await sql`
        UPDATE corporate_cards 
        SET current_month_spend = current_month_spend + ${amount}
        WHERE id = ${cardId}
      `;
    }
    
    return Response.json({
      expense: {
        id: expense.id,
        date: expense.expense_date,
        amount: parseFloat(expense.amount),
        category: expense.category,
        description: expense.description,
        receiptUrl: expense.receipt_url,
        status: expense.status,
        createdAt: expense.created_at,
        user: {
          firstName: user.firstName,
          lastName: user.lastName,
          fullName: user.fullName
        }
      },
      message: 'Expense created successfully'
    }, { status: 201 });
    
  } catch (error) {
    console.error('Create expense error:', error);
    return Response.json(
      { error: 'Failed to create expense' },
      { status: 500 }
    );
  }
}