import { dbRun } from '../database';

/**
 * Insert an audit log entry into the audit_log table.
 *
 * @param entityType - The type of entity being audited (e.g., 'appointment', 'billing', 'customer', 'notification')
 * @param entityId - The unique identifier of the entity
 * @param action - The action that was performed (e.g., 'scheduled', 'cancelled', 'charge_completed')
 * @param details - An object containing additional details about the action (will be JSON-serialized)
 * @param performedBy - Who performed the action (defaults to 'system')
 */
export function insertAuditLog(
  entityType: string,
  entityId: string,
  action: string,
  details: Record<string, any>,
  performedBy: string = 'system',
): void {
  dbRun(
    `INSERT INTO audit_log (entity_type, entity_id, action, details, performed_by) VALUES (?, ?, ?, ?, ?)`,
    [entityType, entityId, action, JSON.stringify(details), performedBy],
  );
}
