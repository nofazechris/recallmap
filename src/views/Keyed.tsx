'use client';

import { useParams, useLocation } from '../lib/router';
import Profile from './Profile';
import Quiz from './Quiz';
import Study from './Study';

// Re-mount flows when their target changes so a fresh deck / quiz is built.
export const KeyedStudy = () => { const { id } = useParams(); const q = useLocation().search; return <Study key={`${id}${q}`} />; };
export const KeyedQuiz = () => { const { id } = useParams(); return <Quiz key={id} />; };
export const KeyedProfile = () => { const { username } = useParams(); return <Profile key={username ?? 'me'} username={username} />; };
