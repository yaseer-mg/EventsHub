import axiosInstance from './axios'

export const getBookings = (params) => axiosInstance.get('/bookings', { params })

export const getBookingById = (id) => axiosInstance.get(`/bookings/${id}`)

export const createBooking = (data) => axiosInstance.post('/bookings', data)

export const updateBooking = (id, data) => axiosInstance.put(`/bookings/${id}`, data)

export const updateBookingStatus = (id, status, data = {}) =>
  axiosInstance.patch(`/bookings/${id}/status`, { status, ...data })

export const toggleBookingActive = (id) => axiosInstance.patch(`/bookings/${id}/toggle`)

export const updatePayment = (id, data) => axiosInstance.patch(`/bookings/${id}/payment`, data)

export const deleteBooking = (id) => axiosInstance.delete(`/bookings/${id}`)
