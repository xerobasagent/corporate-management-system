import sql from '@/app/api/utils/sql';
import { verifyToken } from '@/app/api/utils/auth';

export async function POST(request, { params }) {
  try {
    const user = await verifyToken(request);
    if (!user) {
      return Response.json({ error: 'Authentication required' }, { status: 401 });
    }

    if (!['admin', 'manager'].includes(user.role)) {
      return Response.json({ error: 'Insufficient permissions' }, { status: 403 });
    }

    const body = await request.json();
    const { assigneeId } = body;

    if (!assigneeId) {
      return Response.json({ error: 'assigneeId is required' }, { status: 400 });
    }

    // Verify assignee exists and is an employee
    const assignee = await sql`
      SELECT id, role FROM users WHERE id = ${assigneeId} AND is_active = true
    `;

    if (assignee.length === 0) {
      return Response.json({ error: 'Assignee not found' }, { status: 404 });
    }

    if (assignee[0].role !== 'employee') {
      return Response.json({ error: 'Can only assign jobs to employees' }, { status: 400 });
    }

    // Update job assignment
    const result = await sql`
      UPDATE jobs 
      SET assigned_to = ${assigneeId}, status = 'assigned', updated_at = CURRENT_TIMESTAMP
      WHERE id = ${params.id}
      RETURNING *
    `;

    if (result.length === 0) {
      return Response.json({ error: 'Job not found' }, { status: 404 });
    }

    const job = result[0];
    
    return Response.json({
      id: job.id,
      title: job.title,
      status: job.status,
      assigneeId: job.assigned_to,
      message: 'Job assigned successfully'
    });
  } catch (error) {
    console.error('Error assigning job:', error);
    return Response.json({ error: 'Failed to assign job' }, { status: 500 });
  }
}