import sql from '@/app/api/utils/sql';
import { verifyToken } from '@/app/api/utils/auth';

export async function POST(request, { params }) {
  try {
    const user = await verifyToken(request);
    if (!user) {
      return Response.json({ error: 'Authentication required' }, { status: 401 });
    }

    // Only admin/manager can close jobs
    if (!['admin', 'manager'].includes(user.role)) {
      return Response.json({ error: 'Insufficient permissions' }, { status: 403 });
    }

    const result = await sql`
      UPDATE jobs 
      SET status = 'closed', updated_at = CURRENT_TIMESTAMP
      WHERE id = ${params.id} 
      AND status IN ('completed', 'declined')
      RETURNING *
    `;

    if (result.length === 0) {
      return Response.json({ error: 'Job not found or cannot be closed' }, { status: 404 });
    }

    const job = result[0];
    
    return Response.json({
      id: job.id,
      title: job.title,
      status: job.status,
      message: 'Job closed successfully'
    });
  } catch (error) {
    console.error('Error closing job:', error);
    return Response.json({ error: 'Failed to close job' }, { status: 500 });
  }
}