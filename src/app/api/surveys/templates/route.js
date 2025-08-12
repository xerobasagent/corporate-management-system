import sql from '@/app/api/utils/sql';
import { verifyToken } from '@/app/api/utils/auth';

export async function GET(request) {
  try {
    const user = await verifyToken(request);
    if (!user) {
      return Response.json({ error: 'Authentication required' }, { status: 401 });
    }

    const url = new URL(request.url);
    const target = url.searchParams.get('target');

    // Get active survey templates with their questions
    const templates = await sql`
      SELECT st.*, u.first_name || ' ' || u.last_name as created_by_name
      FROM survey_templates st
      JOIN users u ON st.created_by = u.id
      WHERE st.is_active = true
      ORDER BY st.created_at DESC
    `;

    const templatesWithQuestions = await Promise.all(
      templates.map(async (template) => {
        const questions = await sql`
          SELECT * FROM survey_questions
          WHERE template_id = ${template.id}
          ORDER BY order_index ASC
        `;

        return {
          id: template.id,
          title: template.title,
          description: template.description,
          isMandatory: template.is_mandatory,
          createdByName: template.created_by_name,
          createdAt: template.created_at,
          questions: questions.map(q => ({
            id: q.id,
            text: q.question_text,
            type: q.question_type,
            options: q.options,
            isRequired: q.is_required,
            orderIndex: q.order_index
          }))
        };
      })
    );

    // Filter by target if specified (e.g., 'timesheet')
    const filteredTemplates = target === 'timesheet' ? 
      templatesWithQuestions.filter(t => t.isMandatory) : 
      templatesWithQuestions;

    return Response.json({
      templates: filteredTemplates
    });
  } catch (error) {
    console.error('Error fetching survey templates:', error);
    return Response.json({ error: 'Failed to fetch survey templates' }, { status: 500 });
  }
}