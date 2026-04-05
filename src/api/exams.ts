import { supabase } from './supabase';

const isMissingExamTableError = (error: any) => error?.code === 'PGRST205';

const throwMigrationHint = () => {
  throw new Error('Exam schedules are not set up yet. Apply migration 20260405_create_exam_schedules.sql and retry.');
};

export type ExamSchedule = {
  id: string;
  title: string;
  description?: string | null;
  exam_date: string;
  start_time?: string | null;
  end_time?: string | null;
  department?: string | null;
  year?: number | null;
  created_by: string;
  updated_by?: string | null;
  created_at?: string;
  updated_at?: string;
};

const normalizeDateKey = (value: string) => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  const y = parsed.getFullYear();
  const m = String(parsed.getMonth() + 1).padStart(2, '0');
  const d = String(parsed.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

export const getExamSchedules = async (): Promise<ExamSchedule[]> => {
  const { data, error } = await (supabase
    .from('exam_schedules') as any)
    .select('*')
    .order('exam_date', { ascending: true })
    .order('start_time', { ascending: true });

  if (error) {
    // Allow app to continue working before DB migration is applied.
    if (isMissingExamTableError(error)) return [];
    throw error;
  }
  return (data || []) as ExamSchedule[];
};

export const getExamDateKeys = async (): Promise<string[]> => {
  const { data, error } = await (supabase
    .from('exam_schedules') as any)
    .select('exam_date');

  if (error) {
    // Allow event flows to proceed when exam table is not ready yet.
    if (isMissingExamTableError(error)) return [];
    throw error;
  }

  return Array.from(
    new Set(
      (data || [])
        .map((row: any) => normalizeDateKey(String(row?.exam_date || '')))
        .filter(Boolean)
    )
  );
};

export const createExamSchedule = async (
  payload: {
    title: string;
    description?: string | null;
    exam_date: string;
    start_time?: string | null;
    end_time?: string | null;
    department?: string | null;
    year?: number | null;
  },
  actorId: string
): Promise<ExamSchedule> => {
  const { data, error } = await (supabase
    .from('exam_schedules') as any)
    .insert({
      ...payload,
      created_by: actorId,
      updated_by: actorId,
    })
    .select('*')
    .single();

  if (error) {
    if (isMissingExamTableError(error)) throwMigrationHint();
    throw error;
  }
  return data as ExamSchedule;
};

export const updateExamSchedule = async (
  examId: string,
  payload: {
    title?: string;
    description?: string | null;
    exam_date?: string;
    start_time?: string | null;
    end_time?: string | null;
    department?: string | null;
    year?: number | null;
  },
  actorId: string
): Promise<ExamSchedule> => {
  const { data, error } = await (supabase
    .from('exam_schedules') as any)
    .update({
      ...payload,
      updated_by: actorId,
    })
    .eq('id', examId)
    .select('*')
    .single();

  if (error) {
    if (isMissingExamTableError(error)) throwMigrationHint();
    throw error;
  }
  return data as ExamSchedule;
};

export const deleteExamSchedule = async (examId: string): Promise<void> => {
  const { error } = await (supabase
    .from('exam_schedules') as any)
    .delete()
    .eq('id', examId);

  if (error) {
    if (isMissingExamTableError(error)) throwMigrationHint();
    throw error;
  }
};
