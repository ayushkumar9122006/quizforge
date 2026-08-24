/**
 * useRoom — connects to a WebSocket room and manages all real-time state.
 *
 * Returns:
 *   connected      — WS connection status
 *   participants   — list of {user_id, name, role} currently in room
 *   leaderboard    — live sorted leaderboard entries
 *   quizStarted    — true once admin fires quiz:started
 *   quizEnded      — true once quiz:ended received
 *   sessionInfo    — { session_id, time_per_q_sec, total_questions }
 *   recentSubmit   — last student:submitted event (for admin toast)
 */
import { useState, useEffect, useCallback, useRef } from 'react'
import wsService from '../services/wsService.js'

export function useRoom(roomCode) {
  const [connected,    setConnected]    = useState(false)
  const [participants, setParticipants] = useState([])
  const [leaderboard,  setLeaderboard]  = useState([])
  const [quizStarted,  setQuizStarted]  = useState(false)
  const [quizEnded,    setQuizEnded]    = useState(false)
  const [sessionInfo,  setSessionInfo]  = useState(null)
  const [recentSubmit, setRecentSubmit] = useState(null)

  useEffect(() => {
    if (!roomCode) return

    wsService.connect(roomCode)

    const onConnected    = ()  => setConnected(true)
    const onDisconnected = ()  => setConnected(false)

    const onParticipants = (e) => setParticipants(e.participants || [])

    const onJoined = (e) => setParticipants(prev => {
      if (prev.find(p => p.user_id === e.user_id)) return prev
      return [...prev, { user_id: e.user_id, name: e.name, role: e.role }]
    })

    const onLeft = (e) => setParticipants(prev =>
      prev.filter(p => p.user_id !== e.user_id)
    )

    const onStarted = (e) => {
      setQuizStarted(true)
      setSessionInfo({
        session_id:      e.session_id,
        time_per_q_sec:  e.time_per_q_sec,
        total_questions: e.total_questions,
      })
    }

    const onEnded = () => setQuizEnded(true)

    const onLeaderboard = (e) => setLeaderboard(e.entries || [])

    const onSubmitted = (e) => {
      setRecentSubmit(e)
      // Auto-clear after 4 seconds
      setTimeout(() => setRecentSubmit(null), 4000)
    }

    wsService.on('ws:connected',      onConnected)
    wsService.on('ws:disconnected',   onDisconnected)
    wsService.on('room:participants', onParticipants)
    wsService.on('room:joined',       onJoined)
    wsService.on('room:left',         onLeft)
    wsService.on('quiz:started',      onStarted)
    wsService.on('quiz:ended',        onEnded)
    wsService.on('leaderboard:update',onLeaderboard)
    wsService.on('student:submitted', onSubmitted)

    return () => {
      wsService.off('ws:connected',      onConnected)
      wsService.off('ws:disconnected',   onDisconnected)
      wsService.off('room:participants', onParticipants)
      wsService.off('room:joined',       onJoined)
      wsService.off('room:left',         onLeft)
      wsService.off('quiz:started',      onStarted)
      wsService.off('quiz:ended',        onEnded)
      wsService.off('leaderboard:update',onLeaderboard)
      wsService.off('student:submitted', onSubmitted)
      wsService.disconnect()
    }
  }, [roomCode])

  return {
    connected, participants, leaderboard,
    quizStarted, quizEnded, sessionInfo, recentSubmit,
  }
}
