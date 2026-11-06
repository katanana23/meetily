// Действия со встречей для списка и страницы встречи: те же команды ядра,
// что вызывает сайдбар оригинала (api_save_meeting_title, api_delete_meeting,
// open_meeting_folder). Удаление стирает строки базы, файл записи остаётся.
'use client';

import { invoke } from '@tauri-apps/api/core';
import Analytics from '@/lib/analytics';
import { forgetDetails } from './meeting-details-cache';

export async function renameMeeting(meetingId: string, title: string) {
  await invoke('api_save_meeting_title', { meetingId, title });
}

export async function deleteMeeting(meetingId: string) {
  await invoke('api_delete_meeting', { meetingId });
  forgetDetails(meetingId);
  void Analytics.trackMeetingDeleted(meetingId);
}

export async function openMeetingFolder(meetingId: string) {
  await invoke('open_meeting_folder', { meetingId });
}
