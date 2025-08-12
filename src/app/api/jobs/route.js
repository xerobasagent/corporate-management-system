import sql from '@/app/api/utils/sql';
import { verifyToken } from '@/app/api/utils/auth';

export async function GET(request) {
  try {
    const user = await verifyToken(request);
    if (!user) {
      return Response.json({ error: 'Authentication required' }, { status: 401 });
    }

    const url = new URL(request.url);
    const status = url.searchParams.get('status');
    const assigneeId = url.searchParams.get('assigneeId');
    const clientId = url.searchParams.get('clientId');
    const q = url.searchParams.get('q');
    const page = parseInt(url.searchParams.get('page') || '1');
    const limit = 50;
    const offset = (page - 1) * limit;

    let queryParts = ['SELECT j.*, c.name as client_name, u.first_name || \' \' || u.last_name as assignee_name FROM jobs j'];
    queryParts.push('LEFT JOIN clients c ON j.client_id = c.id');
    queryParts.push('LEFT JOIN users u ON j.assigned_to = u.id');
    queryParts.push('WHERE 1=1');
    
    const params = [];
    let paramIndex = 1;

    // Role-based filtering
    if (user.role === 'employee') {
      queryParts.push(`AND j.assigned_to = $${paramIndex}`);
      params.push(user.id);
      paramIndex++;
    }

    if (status) {
      queryParts.push(`AND j.status = $${paramIndex}`);
      params.push(status);
      paramIndex++;
    }

    if (assigneeId) {
      queryParts.push(`AND j.assigned_to = $${paramIndex}`);
      params.push(assigneeId);
      paramIndex++;
    }

    if (clientId) {
      queryParts.push(`AND j.client_id = $${paramIndex}`);
      params.push(clientId);
      paramIndex++;
    }

    if (q) {
      queryParts.push(`AND (LOWER(j.title) LIKE LOWER($${paramIndex}) OR LOWER(j.description) LIKE LOWER($${paramIndex}))`);
      params.push(`%${q}%`);
      paramIndex++;
    }

    queryParts.push('ORDER BY j.scheduled_date DESC');
    queryParts.push(`LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`);
    params.push(limit, offset);

    const jobs = await sql(queryParts.join(' '), params);

    return Response.json({
      jobs: jobs.map(job => ({
        id: job.id,
        title: job.title,
        description: job.description,
        clientId: job.client_id,
        clientName: job.client_name,
        when: job.scheduled_date,
        scheduledEndDate: job.scheduled_end_date,
        status: job.status,
        priority: job.priority,
        assigneeId: job.assigned_to,
        assigneeName: job.assignee_name,
        pickupLocation: job.pickup_location,
        destination: job.destination,
        notes: job.notes,
        locations: job.pickup_location && job.destination ? [
          { label: 'Pickup', address: job.pickup_location },
          { label: 'Destination', address: job.destination }
        ] : []
      }))
    });
  } catch (error) {
    console.error('Error fetching jobs:', error);
    return Response.json({ error: 'Failed to fetch jobs' }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const user = await verifyToken(request);
    if (!user) {
      return Response.json({ error: 'Authentication required' }, { status: 401 });
    }

    if (!['admin', 'manager'].includes(user.role)) {
      return Response.json({ error: 'Insufficient permissions' }, { status: 403 });
    }

    const body = await request.json();
    const { title, description, clientId, when, scheduledEndDate, pickupLocation, destination, notes, priority = 'medium' } = body;

    if (!title || !description) {
      return Response.json({ error: 'Title and description are required' }, { status: 400 });
    }

    const result = await sql(`
      INSERT INTO jobs (title, description, client_id, assigned_by, scheduled_date, scheduled_end_date, 
                       pickup_location, destination, notes, priority, status)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'assigned')
      RETURNING *
    `, [title, description, clientId, user.id, when, scheduledEndDate, pickupLocation, destination, notes, priority]);

    const job = result[0];
    
    return Response.json({
      id: job.id,
      title: job.title,
      description: job.description,
      clientId: job.client_id,
      when: job.scheduled_date,
      status: job.status,
      priority: job.priority,
      assigneeId: job.assigned_to,
      pickupLocation: job.pickup_location,
      destination: job.destination,
      notes: job.notes
    });
  } catch (error) {
    console.error('Error creating job:', error);
    return Response.json({ error: 'Failed to create job' }, { status: 500 });
  }
}