'use client'

import { useSyncExternalStore } from 'react'
import useSWR from 'swr'
import {
  authService,
  parkingService,
  sensorService,
  tripService,
  userService,
  type TripFilters,
} from '@/lib/services'
import type { User, ZoneId } from '@/lib/types'

export function useSession() {
  const { data, isLoading } = useSWR('session', async () => {
    const userId = await authService.getUserId()
    if (!userId) return null
    try {
      return await userService.getCurrentProfile(userId)
    } catch {
      return null
    }
  })
  return { user: data ?? null, isLoading: isLoading || data === undefined }
}

/** For screens inside the authenticated shell, where the guard guarantees a user. */
export function useCurrentUser(): User {
  const { user } = useSession()
  if (!user) throw new Error('useCurrentUser must be used inside the authenticated app shell')
  return user
}

const keep = { keepPreviousData: true }
// Other students publish trips and answer requests at any time; poll the API to pick that up.
const live = { refreshInterval: 5000 }

export function useAvailableTrips(user: User, filters: TripFilters) {
  return useSWR(['trips', 'available', user.id, filters], () => tripService.listAvailable(user, filters), { ...keep, ...live })
}

export function useMyTrips(user: User) {
  return useSWR(['trips', 'mine', user.id], () => tripService.listMine(user), live)
}

export function useNextTrip(user: User) {
  return useSWR(['trips', 'next', user.id], () => tripService.getNextTrip(user), live)
}

export function useTrip(user: User, tripId: string) {
  return useSWR(['trip', tripId, user.id], () => tripService.getTrip(user, tripId), live)
}

export function useZonesOccupancy(user: User) {
  // Other students check in and sensors report at any time.
  return useSWR(['parking', 'zones', user.id], () => parkingService.getZonesOccupancy(user), { ...keep, ...live })
}

export function useMyParkingEntry(user: User) {
  return useSWR(['parking', 'my-entry', user.id], () => parkingService.getMyActiveEntry(user))
}

export function useForecast(user: User, zoneId: ZoneId, weekday: number) {
  return useSWR(['parking', 'forecast', user.id, zoneId, weekday], () => parkingService.getForecast(user, zoneId, weekday), keep)
}

export function useRecommendation(user: User, zoneId: ZoneId, weekday: number) {
  return useSWR(['parking', 'recommendation', user.id, zoneId, weekday], () => parkingService.getRecommendation(user, zoneId, weekday), keep)
}

export function usePersonalInsight(user: User, weekday: number) {
  return useSWR(['parking', 'insight', user.id, weekday], () => parkingService.getPersonalInsight(user, weekday), keep)
}

export function useProjection(user: User, zoneId: ZoneId, weekday: number, time: string) {
  return useSWR(['parking', 'projection', user.id, zoneId, weekday, time], () => parkingService.projectAt(user, zoneId, weekday, time), keep)
}

export function useSensorEvents(user: User, zoneId: ZoneId) {
  return useSWR(['sensors', 'events', user.id, zoneId], () => sensorService.listRecentEvents(user, zoneId), { ...keep, ...live })
}

export function useSchedules(user: User) {
  return useSWR(['schedules', user.id], () => userService.listSchedules(user))
}

let nowValue = Date.now()
const nowListeners = new Set<() => void>()
let nowTimer: ReturnType<typeof setInterval> | undefined

function subscribeNow(listener: () => void) {
  nowListeners.add(listener)
  if (!nowTimer) {
    nowTimer = setInterval(() => {
      nowValue = Date.now()
      for (const l of nowListeners) l()
    }, 15000)
  }
  return () => {
    nowListeners.delete(listener)
    if (nowListeners.size === 0 && nowTimer) {
      clearInterval(nowTimer)
      nowTimer = undefined
    }
  }
}

/** A clock that ticks every 15 s, for "última lectura hace X min" labels. */
export function useNow(): number {
  return useSyncExternalStore(
    subscribeNow,
    () => nowValue,
    () => nowValue,
  )
}

export function refreshNow() {
  nowValue = Date.now()
  for (const l of nowListeners) l()
}
