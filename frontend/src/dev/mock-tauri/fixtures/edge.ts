// Пограничные встречи: длинная запись без реплик и почти пустая.
// Данные вымышленные.

import { buildTranscript, type MockMeeting } from './types';
import { MOCK_ROOT } from './settings';

export function createEdgeMeetings(): MockMeeting[] {
  return [
    {
      id: 'mock-silent-long',
      // Название в формате, который генерирует useRecordingStart
      title: 'Meeting 30_10_26_18_05_12',
      created_at: '2026-10-30T15:05:12Z',
      updated_at: '2026-10-30T15:10:20Z',
      folder_path: `${MOCK_ROOT}/recordings/Meeting 30_10_26_18_05_12`,
      transcripts: [],
      summary: { status: 'idle' },
    },
    {
      id: 'mock-sparse',
      title: 'Meeting 29_10_26_11_20_03',
      created_at: '2026-10-29T08:20:03Z',
      updated_at: '2026-10-29T08:21:00Z',
      folder_path: `${MOCK_ROOT}/recordings/Meeting 29_10_26_11_20_03`,
      transcripts: buildTranscript('mock-sparse', '2026-10-29T08:20:03Z', [
        ['Зоя Ракитина', 'Проверка связи, меня слышно?'],
        ['Тимур Осокин', 'Слышно, но с эхом. Перезайду через минуту.'],
      ]),
      summary: { status: 'idle' },
    },
  ];
}
