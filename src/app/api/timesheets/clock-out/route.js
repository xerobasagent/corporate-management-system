import sql from '@/app/api/utils/sql';
import { verifyToken } from '@/app/api/utils/auth';

export async function POST(request) {
  try {
    const user = await verifyToken(request);
    if (!user) {
      return Response.json({ error: 'Authentication required' }, { status: 401 });
    }

    if (user.role !== 'employee') {
      return Response.json({ error: 'Only employees can clock out' }, { status: 403 });
    }

    const body = await request.json();
    const { shiftId, lat, lng, accuracy, surveyAnswers } = body;

    // Find the open timesheet to clock out
    let timesheet;
    if (shiftId) {
      const result = await sql`
        SELECT * FROM timesheets 
        WHERE id = ${shiftId} AND user_id = ${user.id} AND clock_out_time IS NULL
      `;
      if (result.length === 0) {
        return Response.json({ error: 'Shift not found or already closed' }, { status: 404 });
      }
      timesheet = result[0];
    } else {
      // Find the most recent open timesheet for this user
      const result = await sql`
        SELECT * FROM timesheets 
        WHERE user_id = ${user.id} AND clock_out_time IS NULL
        ORDER BY clock_in_time DESC
        LIMIT 1
      `;
      if (result.length === 0) {
        return Response.json({ error: 'No open timesheet found' }, { status: 404 });
      }
      timesheet = result[0];
    }

    const clockOutTime = new Date();
    const clockInTime = new Date(timesheet.clock_in_time);
    const durationSec = Math.floor((clockOutTime - clockInTime) / 1000);

    // Update timesheet with clock-out info
    const updatedTimesheet = await sql`
      UPDATE timesheets 
      SET clock_out_time = CURRENT_TIMESTAMP,
          clock_out_location_lat = ${lat},
          clock_out_location_lng = ${lng},
          total_duration_minutes = ${Math.floor(durationSec / 60)},
          survey_completed = ${surveyAnswers ? true : false}
      WHERE id = ${timesheet.id}
      RETURNING *
    `;

    // Record final location update
    if (lat && lng) {
      await sql`
        INSERT INTO location_updates (user_id, timesheet_id, latitude, longitude, accuracy, recorded_at)
        VALUES (${user.id}, ${timesheet.id}, ${lat}, ${lng}, ${accuracy}, CURRENT_TIMESTAMP)
      `;
    }

    // Handle survey answers if provided
    if (surveyAnswers && surveyAnswers.templateId && surveyAnswers.answers) {
      // Create survey response
      const surveyResponse = await sql`
        INSERT INTO survey_responses (timesheet_id, template_id, user_id, job_id, client_id, submitted_at)
        VALUES (${timesheet.id}, ${surveyAnswers.templateId}, ${user.id}, ${timesheet.job_id}, ${timesheet.client_id}, CURRENT_TIMESTAMP)
        RETURNING *
      `;

      // Create individual survey answers
      for (const answer of surveyAnswers.answers) {
        await sql`
          INSERT INTO survey_answers (response_id, question_id, answer_text, answer_rating)
          VALUES (${surveyResponse[0].id}, ${answer.questionId}, ${answer.text}, ${answer.rating})
        `;
      }

      // Mark survey as completed on timesheet
      await sql`
        UPDATE timesheets SET survey_completed = true WHERE id = ${timesheet.id}
      `;
    }

    const finalTimesheet = updatedTimesheet[0];
    
    return Response.json({
      id: finalTimesheet.id,
      userId: finalTimesheet.user_id,
      jobId: finalTimesheet.job_id,
      clientId: finalTimesheet.client_id,
      clockInAt: finalTimesheet.clock_in_time,
      clockOutAt: finalTimesheet.clock_out_time,
      clockOutLoc: lat && lng ? { lat: parseFloat(lat), lng: parseFloat(lng), accuracy } : null,
      durationSec,
      status: 'Closed',
      surveyCompleted: finalTimesheet.survey_completed,
      message: 'Clocked out successfully'
    });
  } catch (error) {
    console.error('Error clocking out:', error);
    return Response.json({ error: 'Failed to clock out' }, { status: 500 });
  }
}