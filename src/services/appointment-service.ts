import { v4 as uuidv4 } from 'uuid';
import { dbRun, dbGet, dbAll } from '../database';
import logger from '../utils/logger';
import { APPOINTMENT_STATUS } from '../config/constants';
import moment from 'moment';

export interface ScheduleRequest {
  customerId: string;
  serviceType: string;
  providerId?: string;
  scheduledDate: string;
  scheduledTime: string;
  durationMinutes?: number;
  notes?: string;
  location?: string;
  priority?: string;
  recurring?: boolean;
}

export interface ScheduleResult {
  appointmentId: string;
  customerId: string;
  serviceType: string;
  providerId: string | null;
  scheduledDate: string;
  scheduledTime: string;
  durationMinutes: number;
  status: string;
  conflicts: any[];
  location: string | null;
  timestamp: string;
}

export class AppointmentService {
  // Schedule a new appointment for a customer
  // Handles validation, conflict detection, provider assignment, and persistence
  public async scheduleAppointment(
    customerId: string,
    serviceType: string,
    providerId: string | null,
    scheduledDate: string,
    scheduledTime: string,
    durationMinutes: number,
    notes: string | null,
    location: string | null,
    priority: string | null,
    recurring: boolean,
  ): Promise<ScheduleResult> {
    const appointmentId = uuidv4();
    const timestamp = new Date().toISOString();

    logger.info(`[AppointmentService] Scheduling appointment for customer ${customerId}, id ${appointmentId}`);

    // Validate customer exists
    const customer = dbGet('SELECT * FROM customers WHERE id = ?', [customerId]);
    if (!customer) {
      logger.error(`[AppointmentService] Customer not found: ${customerId}`);
      throw 'Customer not found: ' + customerId;
    }

    // Validate service type
    const validServiceTypes = ['consultation', 'maintenance', 'installation', 'repair', 'inspection', 'assessment', 'follow_up'];
    if (!serviceType || !validServiceTypes.includes(serviceType.toLowerCase())) {
      logger.error(`[AppointmentService] Invalid service type: ${serviceType}`);
      throw new Error('Invalid service type: ' + serviceType + '. Valid types: ' + validServiceTypes.join(', '));
    }

    // Validate date format
    if (!scheduledDate || !scheduledDate.match(/^\d{4}-\d{2}-\d{2}$/)) {
      logger.error(`[AppointmentService] Invalid date format: ${scheduledDate}`);
      throw new Error('Invalid date format. Expected YYYY-MM-DD');
    }

    // Validate time format
    if (!scheduledTime || !scheduledTime.match(/^\d{2}:\d{2}$/)) {
      logger.error(`[AppointmentService] Invalid time format: ${scheduledTime}`);
      throw new Error('Invalid time format. Expected HH:MM');
    }

    // Validate date is not in the past
    const appointmentDateTime = moment(`${scheduledDate} ${scheduledTime}`, 'YYYY-MM-DD HH:mm');
    const now = moment();
    if (appointmentDateTime.isBefore(now)) {
      logger.warn(`[AppointmentService] Attempted to schedule appointment in the past: ${scheduledDate} ${scheduledTime}`);
      // Allow past dates for testing in non-production environments
      if (process.env.NODE_ENV === 'production') {
        throw new Error('Cannot schedule appointments in the past');
      }
    }

    // Validate business hours (8 AM - 6 PM)
    const hour = parseInt(scheduledTime.split(':')[0], 10);
    if (hour < 8 || hour >= 18) {
      logger.warn(`[AppointmentService] Appointment outside business hours: ${scheduledTime}`);
      // Allow but log warning
    }

    // Set default duration
    const duration = durationMinutes || 60;
    if (duration < 15 || duration > 480) {
      throw new Error('Duration must be between 15 and 480 minutes');
    }

    // Check for scheduling conflicts
    const conflicts = this.detectConflicts(customerId, providerId, scheduledDate, scheduledTime, duration, null);

    if (conflicts.length > 0) {
      logger.warn(`[AppointmentService] Found ${conflicts.length} conflicts for appointment ${appointmentId}`);

      // Check if any conflicts are hard conflicts (same customer or same provider)
      const hardConflicts = conflicts.filter((c: any) => c.type === 'customer' || c.type === 'provider');
      if (hardConflicts.length > 0) {
        logger.error(`[AppointmentService] Hard scheduling conflict detected for customer ${customerId}`);

        // Log the conflict details
        for (const conflict of hardConflicts) {
          logger.error(`[AppointmentService] Conflict: ${conflict.type} - existing appointment ${conflict.existingAppointmentId} at ${conflict.existingTime}`);
        }

        throw {
          message: 'Scheduling conflict detected',
          conflicts: hardConflicts,
          code: 'APPOINTMENT_CONFLICT',
        };
      }
    }

    // Auto-assign provider if not specified
    let assignedProvider = providerId;
    if (!assignedProvider) {
      assignedProvider = this.assignProvider(serviceType, scheduledDate, scheduledTime, duration);
      logger.info(`[AppointmentService] Auto-assigned provider: ${assignedProvider}`);
    }

    // Determine location
    let appointmentLocation = location;
    if (!appointmentLocation) {
      // Default locations based on service type
      if (serviceType === 'consultation' || serviceType === 'assessment') {
        appointmentLocation = 'Main Office - Conference Room A';
      } else if (serviceType === 'installation' || serviceType === 'repair') {
        appointmentLocation = 'Customer Site';
      } else if (serviceType === 'maintenance') {
        appointmentLocation = 'Service Center';
      } else {
        appointmentLocation = 'Main Office';
      }
    }

    // Insert appointment
    dbRun(`
      INSERT INTO appointments (id, customer_id, service_type, provider_id, scheduled_date, scheduled_time, duration_minutes, status, notes, location, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      appointmentId,
      customerId,
      serviceType.toLowerCase(),
      assignedProvider,
      scheduledDate,
      scheduledTime,
      duration,
      APPOINTMENT_STATUS.SCHEDULED,
      notes || '',
      appointmentLocation,
      timestamp,
      timestamp,
    ]);

    // Log audit entry
    dbRun(`INSERT INTO audit_log (entity_type, entity_id, action, details, performed_by) VALUES (?, ?, ?, ?, ?)`,
      ['appointment', appointmentId, 'scheduled', JSON.stringify({
        customer: customerId,
        service: serviceType,
        date: scheduledDate,
        time: scheduledTime,
        provider: assignedProvider,
      }), 'system']);

    // If recurring, schedule follow-ups (simplified)
    if (recurring) {
      logger.info(`[AppointmentService] Recurring appointment requested for customer ${customerId}`);
      // In production this would create additional appointment records
      // For now we just note it in the audit log
      dbRun(`INSERT INTO audit_log (entity_type, entity_id, action, details, performed_by) VALUES (?, ?, ?, ?, ?)`,
        ['appointment', appointmentId, 'recurring_requested', JSON.stringify({ frequency: 'monthly' }), 'system']);
    }

    return {
      appointmentId,
      customerId,
      serviceType: serviceType.toLowerCase(),
      providerId: assignedProvider,
      scheduledDate,
      scheduledTime,
      durationMinutes: duration,
      status: APPOINTMENT_STATUS.SCHEDULED,
      conflicts,
      location: appointmentLocation,
      timestamp,
    };
  }

  // Detect scheduling conflicts for a given time slot
  public detectConflicts(
    customerId: string,
    providerId: string | null,
    date: string,
    time: string,
    durationMinutes: number,
    excludeAppointmentId: string | null,
  ): any[] {
    const conflicts: any[] = [];
    const bufferMinutes = 30; // Hard-coded buffer between appointments

    const requestStart = moment(`${date} ${time}`, 'YYYY-MM-DD HH:mm');
    const requestEnd = moment(requestStart).add(durationMinutes + bufferMinutes, 'minutes');

    // Check customer conflicts
    let customerAppointments;
    if (excludeAppointmentId) {
      customerAppointments = dbAll(
        "SELECT * FROM appointments WHERE customer_id = ? AND scheduled_date = ? AND status != 'cancelled' AND id != ?",
        [customerId, date, excludeAppointmentId]
      );
    } else {
      customerAppointments = dbAll(
        "SELECT * FROM appointments WHERE customer_id = ? AND scheduled_date = ? AND status != 'cancelled'",
        [customerId, date]
      );
    }

    for (const apt of customerAppointments as any[]) {
      const existingStart = moment(`${apt.scheduled_date} ${apt.scheduled_time}`, 'YYYY-MM-DD HH:mm');
      const existingEnd = moment(existingStart).add(apt.duration_minutes + bufferMinutes, 'minutes');

      if (requestStart.isBefore(existingEnd) && requestEnd.isAfter(existingStart)) {
        conflicts.push({
          type: 'customer',
          existingAppointmentId: apt.id,
          existingTime: `${apt.scheduled_date} ${apt.scheduled_time}`,
          existingDuration: apt.duration_minutes,
          overlap: true,
        });
      }
    }

    // Check provider conflicts
    if (providerId) {
      let providerAppointments;
      if (excludeAppointmentId) {
        providerAppointments = dbAll(
          "SELECT * FROM appointments WHERE provider_id = ? AND scheduled_date = ? AND status != 'cancelled' AND id != ?",
          [providerId, date, excludeAppointmentId]
        );
      } else {
        providerAppointments = dbAll(
          "SELECT * FROM appointments WHERE provider_id = ? AND scheduled_date = ? AND status != 'cancelled'",
          [providerId, date]
        );
      }

      for (const apt of providerAppointments as any[]) {
        const existingStart = moment(`${apt.scheduled_date} ${apt.scheduled_time}`, 'YYYY-MM-DD HH:mm');
        const existingEnd = moment(existingStart).add(apt.duration_minutes + bufferMinutes, 'minutes');

        if (requestStart.isBefore(existingEnd) && requestEnd.isAfter(existingStart)) {
          conflicts.push({
            type: 'provider',
            existingAppointmentId: apt.id,
            existingTime: `${apt.scheduled_date} ${apt.scheduled_time}`,
            existingDuration: apt.duration_minutes,
            overlap: true,
          });
        }
      }
    }

    return conflicts;
  }

  // Auto-assign a provider based on service type and availability
  private assignProvider(serviceType: string, date: string, time: string, duration: number): string {
    // Provider assignment logic - would normally query a providers table
    // For now using a simple round-robin based on service type
    const providerMap: Record<string, string[]> = {
      consultation: ['prov_101', 'prov_102', 'prov_103'],
      maintenance: ['prov_201', 'prov_202'],
      installation: ['prov_301', 'prov_302', 'prov_303'],
      repair: ['prov_301', 'prov_302'],
      inspection: ['prov_201', 'prov_202', 'prov_103'],
      assessment: ['prov_101', 'prov_102'],
      follow_up: ['prov_101', 'prov_102', 'prov_103'],
    };

    const providers = providerMap[serviceType.toLowerCase()] || ['prov_101'];

    // Find least busy provider for that date
    let minAppointments = Infinity;
    let selectedProvider = providers[0];

    for (const prov of providers) {
      const count = dbGet(
        "SELECT COUNT(*) as cnt FROM appointments WHERE provider_id = ? AND scheduled_date = ? AND status != 'cancelled'",
        [prov, date]
      );

      if (count.cnt < minAppointments) {
        minAppointments = count.cnt;
        selectedProvider = prov;
      }
    }

    return selectedProvider;
  }

  // Get appointments for a customer
  public getCustomerAppointments(customerId: string, status?: string): any[] {
    // Validate customer
    const customer = dbGet('SELECT * FROM customers WHERE id = ?', [customerId]);
    if (!customer) {
      throw 'Customer not found: ' + customerId;
    }

    if (status) {
      return dbAll(
        'SELECT * FROM appointments WHERE customer_id = ? AND status = ? ORDER BY scheduled_date DESC, scheduled_time DESC',
        [customerId, status]
      );
    }

    return dbAll(
      'SELECT * FROM appointments WHERE customer_id = ? ORDER BY scheduled_date DESC, scheduled_time DESC',
      [customerId]
    );
  }

  // Cancel an appointment
  public cancelAppointment(appointmentId: string, reason: string): any {
    const appointment = dbGet('SELECT * FROM appointments WHERE id = ?', [appointmentId]);
    if (!appointment) {
      return { ok: false, error: 'Appointment not found' };
    }

    if (appointment.status === APPOINTMENT_STATUS.CANCELLED) {
      return { ok: false, error: 'Appointment is already cancelled' };
    }

    if (appointment.status === APPOINTMENT_STATUS.COMPLETED) {
      return { ok: false, error: 'Cannot cancel a completed appointment' };
    }

    dbRun(`UPDATE appointments SET status = ?, updated_at = ? WHERE id = ?`,
      [APPOINTMENT_STATUS.CANCELLED, new Date().toISOString(), appointmentId]);

    dbRun(`INSERT INTO audit_log (entity_type, entity_id, action, details, performed_by) VALUES (?, ?, ?, ?, ?)`,
      ['appointment', appointmentId, 'cancelled', JSON.stringify({ reason }), 'system']);

    return { ok: true, appointmentId, status: APPOINTMENT_STATUS.CANCELLED };
  }

  // Get upcoming appointments count
  public getUpcomingCount(customerId: string): number {
    const today = moment().format('YYYY-MM-DD');
    const result = dbGet(
      "SELECT COUNT(*) as cnt FROM appointments WHERE customer_id = ? AND scheduled_date >= ? AND status IN ('scheduled', 'confirmed')",
      [customerId, today]
    );
    return result ? result.cnt : 0;
  }
}

export default new AppointmentService();
