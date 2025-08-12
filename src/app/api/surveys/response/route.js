import sql from '@/app/api/utils/sql';
import { verifyToken } from '@/app/api/utils/auth';

export async function POST(request) {
  try {
    const user = await verifyToken(request);
    if (!user) {
      return Response.json({ error: 'Authentication required' }, { status: 401 });
    }

    const body = await request.json();
    const { templateId, shiftId, answers } = body;

    if (!templateId || !answers || !Array.isArray(answers)) {
      return Response.json({ error: 'templateId and answers are required' }, { status: 400 });
    }

    // Validate template exists
    const template = await sql`
      SELECT * FROM survey_templates WHERE id = ${templateId} AND is_active = true
    `;
    
    if (template.length === 0) {
      return Response.json({ error: 'Survey template not found' }, { status: 404 });
    }

    // Get timesheet info if provided
    let timesheet = null;
    if (shiftId) {
      const result = await sql`
        SELECT * FROM timesheets WHERE id = ${shiftId} AND user_id = ${user.id}
      `;
      if (result.length === 0) {
        return Response.json({ error: 'Timesheet not found' }, { status: 404 });
      }
      timesheet = result[0];
    }

    // Create survey response
    const surveyResponse = await sql`
      INSERT INTO survey_responses (
        timesheet_id, template_id, user_id, job_id, client_id, submitted_at
      )
      VALUES (${shiftId}, ${templateId}, ${user.id}, ${timesheet?.job_id}, ${timesheet?.client_id}, CURRENT_TIMESTAMP)
      RETURNING *
    `;

    const responseId = surveyResponse[0].id;

    // Create individual survey answers
    const answerPromises = answers.map(answer => {
      const { questionId, text, rating } = answer;
      return sql`
        INSERT INTO survey_answers (response_id, question_id, answer_text, answer_rating)
        VALUES (${responseId}, ${questionId}, ${text}, ${rating})
        RETURNING *
      `;
    });

    const createdAnswers = await Promise.all(answerPromises);

    // If this was for a timesheet, mark survey as completed
    if (shiftId) {
      await sql`
        UPDATE timesheets SET survey_completed = true WHERE id = ${shiftId}
      `;
    }
    
    return Response.json({
      responseId,
      templateId,
      shiftId,
      answersCount: createdAnswers.length,
      submittedAt: surveyResponse[0].submitted_at,
      message: 'Survey response submitted successfully'
    });
  } catch (error) {
    console.error('Error submitting survey response:', error);
    return Response.json({ error: 'Failed to submit survey response' }, { status: 500 });
  }
}