import sql from '@/app/api/utils/sql';
import { verifyToken } from '@/app/api/utils/auth';

export async function POST(request) {
  try {
    const user = await verifyToken(request);
    if (!user) {
      return Response.json({ error: 'Authentication required' }, { status: 401 });
    }

    if (user.role !== 'employee') {
      return Response.json({ error: 'Only employees can submit location updates' }, { status: 403 });
    }

    const body = await request.json();
    const { shiftId, ts, lat, lng, accuracy, speed, heading, address } = body;

    if (!lat || !lng) {
      return Response.json({ error: 'Latitude and longitude are required' }, { status: 400 });
    }

    // Verify the shift belongs to the user and is open
    let timesheetId = null;
    if (shiftId) {
      const timesheet = await sql`
        SELECT id FROM timesheets 
        WHERE id = ${shiftId} AND user_id = ${user.id} AND clock_out_time IS NULL
      `;
      if (timesheet.length === 0) {
        return Response.json({ error: 'Invalid or closed shift' }, { status: 404 });
      }
      timesheetId = shiftId;
    }

    // Record location update
    const recordedAt = ts ? new Date(ts) : new Date();
    
    const result = await sql`
      INSERT INTO location_updates (
        user_id, timesheet_id, latitude, longitude, accuracy, 
        speed, heading, address, recorded_at
      )
      VALUES (${user.id}, ${timesheetId}, ${lat}, ${lng}, ${accuracy}, 
              ${speed}, ${heading}, ${address}, ${recordedAt})
      RETURNING *
    `;

    const locationUpdate = result[0];
    
    return Response.json({
      id: locationUpdate.id,
      userId: locationUpdate.user_id,
      timesheetId: locationUpdate.timesheet_id,
      lat: parseFloat(locationUpdate.latitude),
      lng: parseFloat(locationUpdate.longitude),
      accuracy: locationUpdate.accuracy,
      speed: locationUpdate.speed,
      heading: locationUpdate.heading,
      address: locationUpdate.address,
      recordedAt: locationUpdate.recorded_at,
      message: 'Location update recorded'
    });
  } catch (error) {
    console.error('Error recording location update:', error);
    return Response.json({ error: 'Failed to record location update' }, { status: 500 });
  }
}