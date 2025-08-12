import sql from '@/app/api/utils/sql';
import { verifyToken } from '@/app/api/utils/auth';

export async function POST(request) {
  try {
    const user = await verifyToken(request);
    if (!user) {
      return Response.json({ error: 'Authentication required' }, { status: 401 });
    }

    if (user.role !== 'employee') {
      return Response.json({ error: 'Only employees can clock in' }, { status: 403 });
    }

    const body = await request.json();
    const { jobId, clientId, lat, lng, accuracy } = body;

    // Check if user already has an open timesheet
    const openShift = await sql`
      SELECT id FROM timesheets 
      WHERE user_id = ${user.id} AND clock_out_time IS NULL
      LIMIT 1
    `;

    if (openShift.length > 0) {
      return Response.json({ error: 'You already have an open timesheet' }, { status: 400 });
    }

    // Validate job and client exist if provided
    if (jobId) {
      const job = await sql`SELECT id FROM jobs WHERE id = ${jobId}`;
      if (job.length === 0) {
        return Response.json({ error: 'Job not found' }, { status: 404 });
      }
    }

    if (clientId) {
      const client = await sql`SELECT id FROM clients WHERE id = ${clientId}`;
      if (client.length === 0) {
        return Response.json({ error: 'Client not found' }, { status: 404 });
      }
    }

    // Create new timesheet
    const result = await sql`
      INSERT INTO timesheets (
        user_id, job_id, client_id, clock_in_time, 
        clock_in_location_lat, clock_in_location_lng
      )
      VALUES (${user.id}, ${jobId}, ${clientId}, CURRENT_TIMESTAMP, ${lat}, ${lng})
      RETURNING *
    `;

    const timesheet = result[0];

    // Also record initial location update
    if (lat && lng) {
      await sql`
        INSERT INTO location_updates (user_id, timesheet_id, latitude, longitude, accuracy, recorded_at)
        VALUES (${user.id}, ${timesheet.id}, ${lat}, ${lng}, ${accuracy}, CURRENT_TIMESTAMP)
      `;
    }
    
    return Response.json({
      id: timesheet.id,
      userId: timesheet.user_id,
      jobId: timesheet.job_id,
      clientId: timesheet.client_id,
      clockInAt: timesheet.clock_in_time,
      clockInLoc: lat && lng ? { lat: parseFloat(lat), lng: parseFloat(lng), accuracy } : null,
      status: 'Open',
      message: 'Clocked in successfully'
    });
  } catch (error) {
    console.error('Error clocking in:', error);
    return Response.json({ error: 'Failed to clock in' }, { status: 500 });
  }
}