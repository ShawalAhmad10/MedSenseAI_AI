-- Create team_members table (simple)
-- Stores minimal team-specific data, fetches user details from users table

CREATE TABLE IF NOT EXISTS team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  
  -- Team-specific fields only
  position VARCHAR(100), -- e.g., 'Pharmacist', 'Senior Pharmacist'
  joined_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  is_active BOOLEAN DEFAULT true,
  
  -- Timestamps
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  -- One user can only be a team member once
  UNIQUE(user_id)
);

-- Indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_team_members_user_id ON team_members(user_id);
CREATE INDEX IF NOT EXISTS idx_team_members_is_active ON team_members(is_active);

COMMENT ON TABLE team_members IS 'Team management - references users table for member details';
