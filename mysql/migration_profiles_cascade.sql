-- Migration: When an organization is deleted, related profiles are also deleted (CASCADE).
-- Only assessments and invites still block organization deletion (checked in application).
-- Run this once on existing databases.

ALTER TABLE profiles
  DROP FOREIGN KEY fk_profiles_organization;

ALTER TABLE profiles
  MODIFY organization_id CHAR(36) NOT NULL;

ALTER TABLE profiles
  ADD CONSTRAINT fk_profiles_organization
  FOREIGN KEY (organization_id) REFERENCES organizations(id)
  ON DELETE CASCADE;
