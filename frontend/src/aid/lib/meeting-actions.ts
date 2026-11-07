// Действия со встречей для списка и страницы встречи: те же команды ядра,
// что вызывает сайдбар оригинала (api_save_meeting_title, api_delete_meeting,
// open_meeting_folder). Удаление кладёт встречу и папку записи в корзину на 7 дней
// (meeting-trash.ts); строки базы стираются по сроку.
'use client';

import { invoke } from '@tauri-apps/api/core';
import { trashMeeting } from './meeting-trash';

export async function renameMeeting(meetingId: string, title: string) {
  await invoke('api_save_meeting_title', { meetingId, title });
}

/** Удаление человеком: в корзину на 7 дней, оттуда можно вернуть (meeting-trash.ts). */
export async function deleteMeeting(meetingId: string) {
  await trashMeeting(meetingId);
}

export async function openMeetingFolder(meetingId: string) {
  await invoke('open_meeting_folder', { meetingId });
}
