import sql from '@/app/api/utils/sql';
import { requireAuth, PERMISSIONS, hasRole } from '@/app/api/utils/auth';

// GET /api/expenses/[id] - Get single expense
export async function GET(request, { params }) {
  const user = await requireAuth(request, PERMISSIONS.SUBMIT_EXPENSES);
  if (user instanceof Response) return user; // Auth failed
  
  try {
    const { id } = params;
    
    if (!id) {
      return Response.json(
        { error: 'Expense ID is required' },
        { status: 400 }
      );
    }
    
    // Build query with role-based filtering
    let whereClause = 'WHERE e.id = $1';
    const queryParams = [id];
    
    // Employees can only see their own expenses
    if (!hasRole(user, PERMISSIONS.VIEW_ALL_EXPENSES)) {
      whereClause += ' AND e.user_id = $2';
      queryParams.push(user.id);
    }
    
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
    `;
    
    const expenses = await sql(query, queryParams);
    
    if (expenses.length === 0) {
      return Response.json(
        { error: 'Expense not found' },
        { status: 404 }
      );
    }
    
    const expense = expenses[0];
    
    return Response.json({
      expense: {
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
      }
    });
    
  } catch (error) {
    console.error('Get expense error:', error);
    return Response.json(
      { error: 'Failed to fetch expense' },
      { status: 500 }
    );
  }
}

// PATCH /api/expenses/[id] - Update expense (only if pending)
export async function PATCH(request, { params }) {
  const user = await requireAuth(request, PERMISSIONS.SUBMIT_EXPENSES);
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
    
    // Check if expense exists and user has permission
    let whereClause = 'WHERE id = $1';
    const checkParams = [id];
    
    // Employees can only edit their own expenses
    if (!hasRole(user, PERMISSIONS.VIEW_ALL_EXPENSES)) {
      whereClause += ' AND user_id = $2';
      checkParams.push(user.id);
    }
    
    const existingExpenses = await sql(`
      SELECT id, status, user_id, card_id, amount
      FROM expenses 
      ${whereClause}
    `, checkParams);
    
    if (existingExpenses.length === 0) {
      return Response.json(
        { error: 'Expense not found' },
        { status: 404 }
      );
    }
    
    const existingExpense = existingExpenses[0];
    
    // Only pending expenses can be updated
    if (existingExpense.status !== 'pending') {
      return Response.json(
        { error: 'Only pending expenses can be updated' },
        { status: 400 }
      );
    }
    
    // Build update query dynamically
    const updateFields = [];
    const updateParams = [];
    let paramIndex = 1;
    
    const { date, amount, category, description, receiptUrl, cardId } = data;
    
    if (date !== undefined) {
      updateFields.push(`expense_date = $${paramIndex}`);
      updateParams.push(date);
      paramIndex++;
    }
    
    if (amount !== undefined) {
      if (amount <= 0) {
        return Response.json(
          { error: 'Amount must be greater than 0' },
          { status: 400 }
        );
      }
      updateFields.push(`amount = $${paramIndex}`);
      updateParams.push(amount);
      paramIndex++;
    }
    
    if (category !== undefined) {
      updateFields.push(`category = $${paramIndex}`);
      updateParams.push(category);
      paramIndex++;
    }
    
    if (description !== undefined) {
      updateFields.push(`description = $${paramIndex}`);
      updateParams.push(description);
      paramIndex++;
    }
    
    if (receiptUrl !== undefined) {
      updateFields.push(`receipt_url = $${paramIndex}`);
      updateParams.push(receiptUrl);
      paramIndex++;
    }
    
    if (cardId !== undefined) {
      // Verify card access if specified
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
      
      updateFields.push(`card_id = $${paramIndex}`);
      updateParams.push(cardId);
      paramIndex++;
    }
    
    if (updateFields.length === 0) {
      return Response.json(
        { error: 'No valid fields to update' },
        { status: 400 }
      );
    }
    
    // Add updated_at timestamp
    updateFields.push(`updated_at = NOW()`);
    
    // Add WHERE clause parameters
    updateParams.push(id);
    if (!hasRole(user, PERMISSIONS.VIEW_ALL_EXPENSES)) {
      updateParams.push(user.id);
    }
    
    const updateQuery = `
      UPDATE expenses 
      SET ${updateFields.join(', ')}
      ${whereClause}
      RETURNING id, expense_date, amount, category, description, receipt_url, status, updated_at
    `;
    
    const updatedExpenses = await sql(updateQuery, updateParams);
    
    // Update card spend if amount changed
    if (amount !== undefined && amount !== existingExpense.amount) {
      const oldCardId = existingExpense.card_id;
      const newCardId = cardId !== undefined ? cardId : oldCardId;
      const amountDiff = amount - existingExpense.amount;
      
      // Update old card (subtract old amount)
      if (oldCardId && oldCardId !== newCardId) {
        await sql`
          UPDATE corporate_cards 
          SET current_month_spend = current_month_spend - ${existingExpense.amount}
          WHERE id = ${oldCardId}
        `;
      }
      
      // Update new card (add new amount or adjust difference)
      if (newCardId) {
        if (oldCardId === newCardId) {
          // Same card, just adjust the difference
          await sql`
            UPDATE corporate_cards 
            SET current_month_spend = current_month_spend + ${amountDiff}
            WHERE id = ${newCardId}
          `;
        } else {
          // Different card, add full new amount
          await sql`
            UPDATE corporate_cards 
            SET current_month_spend = current_month_spend + ${amount}
            WHERE id = ${newCardId}
          `;
        }
      }
    }
    
    const updatedExpense = updatedExpenses[0];
    
    return Response.json({
      expense: {
        id: updatedExpense.id,
        date: updatedExpense.expense_date,
        amount: parseFloat(updatedExpense.amount),
        category: updatedExpense.category,
        description: updatedExpense.description,
        receiptUrl: updatedExpense.receipt_url,
        status: updatedExpense.status,
        updatedAt: updatedExpense.updated_at
      },
      message: 'Expense updated successfully'
    });
    
  } catch (error) {
    console.error('Update expense error:', error);
    return Response.json(
      { error: 'Failed to update expense' },
      { status: 500 }
    );
  }
}

// DELETE /api/expenses/[id] - Delete expense (only if pending)
export async function DELETE(request, { params }) {
  const user = await requireAuth(request, PERMISSIONS.SUBMIT_EXPENSES);
  if (user instanceof Response) return user; // Auth failed
  
  try {
    const { id } = params;
    
    if (!id) {
      return Response.json(
        { error: 'Expense ID is required' },
        { status: 400 }
      );
    }
    
    // Check if expense exists and user has permission
    let whereClause = 'WHERE id = $1';
    const params_list = [id];
    
    // Employees can only delete their own expenses
    if (!hasRole(user, PERMISSIONS.VIEW_ALL_EXPENSES)) {
      whereClause += ' AND user_id = $2';
      params_list.push(user.id);
    }
    
    const existingExpenses = await sql(`
      SELECT id, status, card_id, amount
      FROM expenses 
      ${whereClause}
    `, params_list);
    
    if (existingExpenses.length === 0) {
      return Response.json(
        { error: 'Expense not found' },
        { status: 404 }
      );
    }
    
    const expense = existingExpenses[0];
    
    // Only pending expenses can be deleted
    if (expense.status !== 'pending') {
      return Response.json(
        { error: 'Only pending expenses can be deleted' },
        { status: 400 }
      );
    }
    
    // Delete the expense
    await sql(`DELETE FROM expenses ${whereClause}`, params_list);
    
    // Update card spend if applicable
    if (expense.card_id) {
      await sql`
        UPDATE corporate_cards 
        SET current_month_spend = current_month_spend - ${expense.amount}
        WHERE id = ${expense.card_id}
      `;
    }
    
    return Response.json({
      message: 'Expense deleted successfully'
    });
    
  } catch (error) {
    console.error('Delete expense error:', error);
    return Response.json(
      { error: 'Failed to delete expense' },
      { status: 500 }
    );
  }
}