import sql from '@/app/api/utils/sql';

export async function GET(request) {
  try {
    const authHeader = request.headers.get('authorization');
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return Response.json(
        { error: 'No valid token provided' }, 
        { status: 401 }
      );
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    if (!token) {
      return Response.json(
        { error: 'No valid token provided' }, 
        { status: 401 }
      );
    }

    // For demo purposes, decode the simple JWT token
    // In production, use proper JWT verification
    try {
      const parts = token.split('.');
      if (parts.length !== 3) {
        throw new Error('Invalid token format');
      }

      const payload = JSON.parse(atob(parts[1]));
      
      // Check if token is expired
      if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
        return Response.json(
          { error: 'Token expired' }, 
          { status: 401 }
        );
      }

      // Verify session exists in database
      const tokenHash = btoa(token).substring(0, 255);
      const sessions = await sql`
        SELECT s.*, u.role, u.first_name, u.last_name, u.employee_id, u.is_active
        FROM user_sessions s
        JOIN users u ON s.user_id = u.id
        WHERE s.token_hash = ${tokenHash} 
        AND s.expires_at > NOW()
        AND u.is_active = true
      `;

      if (sessions.length === 0) {
        return Response.json(
          { error: 'Invalid or expired session' }, 
          { status: 401 }
        );
      }

      const session = sessions[0];

      // Update last used timestamp
      await sql`
        UPDATE user_sessions 
        SET last_used_at = NOW() 
        WHERE id = ${session.id}
      `;

      // Return user data
      const userData = {
        id: session.user_id,
        email: payload.email,
        role: session.role,
        firstName: session.first_name,
        lastName: session.last_name,
        employeeId: session.employee_id,
        fullName: `${session.first_name} ${session.last_name}`
      };

      return Response.json({
        valid: true,
        user: userData
      });

    } catch (decodeError) {
      return Response.json(
        { error: 'Invalid token' }, 
        { status: 401 }
      );
    }

  } catch (error) {
    console.error('Token verification error:', error);
    return Response.json(
      { error: 'Internal server error' }, 
      { status: 500 }
    );
  }
}