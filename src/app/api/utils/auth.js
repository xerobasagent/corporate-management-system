import sql from './sql.js';

// Extract and verify token from request
export async function verifyToken(request) {
  const authHeader = request.headers.get('authorization');
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.substring(7);
  
  if (!token) {
    return null;
  }

  try {
    // Decode simple JWT token (for demo)
    const parts = token.split('.');
    if (parts.length !== 3) {
      return null;
    }

    const payload = JSON.parse(atob(parts[1]));
    
    // Check if token is expired
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }

    // Verify session exists in database
    const tokenHash = btoa(token).substring(0, 255);
    const sessions = await sql`
      SELECT s.*, u.role, u.first_name, u.last_name, u.employee_id, u.is_active, u.email
      FROM user_sessions s
      JOIN users u ON s.user_id = u.id
      WHERE s.token_hash = ${tokenHash} 
      AND s.expires_at > NOW()
      AND u.is_active = true
    `;

    if (sessions.length === 0) {
      return null;
    }

    const session = sessions[0];

    // Update last used timestamp
    await sql`
      UPDATE user_sessions 
      SET last_used_at = NOW() 
      WHERE id = ${session.id}
    `;

    return {
      id: session.user_id,
      email: session.email,
      role: session.role,
      firstName: session.first_name,
      lastName: session.last_name,
      employeeId: session.employee_id,
      fullName: `${session.first_name} ${session.last_name}`
    };

  } catch (error) {
    console.error('Token verification error:', error);
    return null;
  }
}

// Check if user has required role
export function hasRole(user, allowedRoles) {
  if (!user || !user.role) {
    return false;
  }
  
  if (Array.isArray(allowedRoles)) {
    return allowedRoles.includes(user.role);
  }
  
  return user.role === allowedRoles;
}

// Role hierarchy for permission checking
const roleHierarchy = {
  employee: 0,
  accountant: 1, 
  manager: 2,
  admin: 3
};

// Check if user has minimum required role level
export function hasMinimumRole(user, minimumRole) {
  if (!user || !user.role) {
    return false;
  }
  
  const userLevel = roleHierarchy[user.role] ?? -1;
  const requiredLevel = roleHierarchy[minimumRole] ?? 999;
  
  return userLevel >= requiredLevel;
}

// Middleware function to protect routes
export async function requireAuth(request, allowedRoles = null) {
  const user = await verifyToken(request);
  
  if (!user) {
    return Response.json(
      { error: 'Authentication required' }, 
      { status: 401 }
    );
  }

  // Check role permissions if specified
  if (allowedRoles && !hasRole(user, allowedRoles)) {
    return Response.json(
      { error: 'Insufficient permissions' }, 
      { status: 403 }
    );
  }

  return user; // Return user data if auth successful
}

// Permission constants based on the master plan
export const PERMISSIONS = {
  // Expense permissions
  VIEW_ALL_EXPENSES: ['admin', 'manager', 'accountant'],
  APPROVE_EXPENSES: ['admin', 'manager'], 
  SUBMIT_EXPENSES: ['admin', 'manager', 'accountant', 'employee'],
  
  // Card permissions
  MANAGE_CARDS: ['admin'],
  
  // Reports permissions
  VIEW_REPORTS: ['admin', 'manager', 'accountant'],
  
  // Job permissions
  ASSIGN_JOBS: ['admin', 'manager'],
  ACCEPT_JOBS: ['employee'],
  
  // Timesheet permissions
  CLOCK_IN_OUT: ['employee'],
  VIEW_ALL_TIMESHEETS: ['admin', 'manager'],
  
  // Survey permissions
  FILL_SURVEYS: ['employee'],
  MANAGE_SURVEYS: ['admin', 'manager'],
  
  // Reminder permissions
  VIEW_REMINDERS: ['admin', 'manager', 'accountant', 'employee'], // Employees see only their own
  MANAGE_REMINDERS: ['admin', 'manager', 'accountant']
};