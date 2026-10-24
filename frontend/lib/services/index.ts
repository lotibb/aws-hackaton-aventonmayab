/**
 * Service layer. UI components depend only on these exports.
 * Each mock implementation can be swapped for an AWS-backed one (Cognito, API Gateway + Lambda,
 * DynamoDB, IoT Core) with the same signatures, without touching components.
 */
export { authService } from './authService'
export { isInstitutionalEmail } from './validation'
export { tripService } from './trip-service'
export type { PublishTripInput, TripFilters } from './trip-service'
export { parkingService } from './parking-service'
export type { ParkingRecommendation, PersonalInsight } from './parking-service'
export { sensorService } from './sensor-service'
export { userService } from './user-service'
export type { ImportedClass, ProfileUpdate, ScheduleFileType, ScheduleInput } from './user-service'
export { ServiceError, errorMessage } from './errors'
export { resetDb as resetDemoData, subscribeDb as subscribeToChanges } from '../mock/db'
