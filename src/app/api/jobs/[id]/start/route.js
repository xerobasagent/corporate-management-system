import sql from '@/app/api/utils/sql';
import { verifyToken } from '@/app/api/utils/auth';

export async function POST(request, { params }) {
  try {
    const user = await verifyToken(request);
    if (!user) {
      return Response.json({ error: 'Authentication required' }, { status: 401 });
    }

    // Only employees can start jobs, and only jobs assigned to them
    const result = await sql`
      UPDATE jobs 
      SET status = 'in_progress', started_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE id = ${params.id} 
      AND assigned_to = ${user.id} 
      AND status = 'accepted'
      RETURNING *
    `;

    if (result.length === 0) {
      return Response.json({ error: 'Job not found or cannot be started' }, { status: 404 });
    }

    const job = result[0];
    
    return Response.json({
      id: job.id,
      title: job.title,
      status: job.status,
      startedAt: job.started_at,
      message: 'Job started successfully'
    });
  } catch (error) {
    console.error('Error starting job:', error);
    return Response.json({ error: 'Failed to start job' }, { status: 500 });
  }
}