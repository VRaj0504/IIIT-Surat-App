import React from 'react';
import { useAuth } from '../context/AuthContext';
import AttendanceScreen from './AttendanceScreen';
import FacultyNavigator from '../navigation/FacultyNavigator';

// Faculty tapping "Attendance" see the start-session/live-roster flow.
// Students tapping "Attendance" see their personal % tracker. Same tab,
// different screen depending on who's logged in.
export default function AttendanceRouter() {
  const { profile } = useAuth();
  return profile?.role === 'faculty' ? <FacultyNavigator /> : <AttendanceScreen />;
}