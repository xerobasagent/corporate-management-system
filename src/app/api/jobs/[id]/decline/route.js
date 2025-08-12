import sql from '@/app/api/utils/sql';
import { verifyToken } from '@/app/api/utils/auth';

export async function POST(request, { params }) {
  try {
    const user = await verifyToken(request);
    if (!user) {
      return Response.json({ error: 'Authentication required' }, { status: 401 });
    }

    // Only employees can decline jobs, and only jobs assigned to them
    const result = await sql`
      UPDATE jobs 
      SET status = 'declined', updated_at = CURRENT_TIMESTAMP
      WHERE id = ${params.id} 
      AND assigned_to = ${user.id} 
      AND status = 'assigned'
      RETURNING *
    `;

    if (result.length === 0) {
      return Response.json({ error: 'Job not found or cannot be declined' }, { status: 404 });
    }

    const job = result[0];
    
    return Response.json({
      id: job.id,
      title: job.title,
      status: job.status,
      message: 'Job declined successfully'
    });
  } catch (error) {
    console.error('Error declining job:', error);
    return Response.json({ error: 'Failed to decline job' }, { status: 500 });
  }
}