import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Plan, Schedule, User } from './types';

interface AppState {
  // 사용자 정보 (localStorage 기반 임시 구현)
  currentUser: User | null;
  setCurrentUser: (user: User | null) => void;

  // 여행 목록
  plans: Plan[];
  setPlans: (plans: Plan[]) => void;
  addPlan: (plan: Plan) => void;
  updatePlan: (id: number, plan: Partial<Plan>) => void;
  removePlan: (id: number) => void;

  // 현재 선택된 여행
  selectedPlan: Plan | null;
  setSelectedPlan: (plan: Plan | null) => void;

  // 일정 목록
  schedules: Schedule[];
  setSchedules: (schedules: Schedule[]) => void;
  addSchedule: (schedule: Schedule) => void;
  updateSchedule: (id: number, schedule: Partial<Schedule>) => void;
  removeSchedule: (id: number) => void;

  // 로딩 상태
  isLoading: boolean;
  setLoading: (loading: boolean) => void;
}

export const useStore = create<AppState>()(
  persist(
    (set) => ({
      // 초기 상태
      currentUser: null,
      plans: [],
      selectedPlan: null,
      schedules: [],
      isLoading: false,

      // 사용자 관련
      setCurrentUser: (user) => set({ currentUser: user }),

      // 여행 관련
      setPlans: (plans) => set({ plans }),
      addPlan: (plan) => set((state) => ({ plans: [...state.plans, plan] })),
      updatePlan: (id, updatedPlan) =>
        set((state) => ({
          plans: state.plans.map((p) => (p.id === id ? { ...p, ...updatedPlan } : p)),
          selectedPlan:
            state.selectedPlan?.id === id
              ? { ...state.selectedPlan, ...updatedPlan }
              : state.selectedPlan,
        })),
      removePlan: (id) =>
        set((state) => ({
          plans: state.plans.filter((p) => p.id !== id),
          selectedPlan: state.selectedPlan?.id === id ? null : state.selectedPlan,
        })),
      setSelectedPlan: (plan) => set({ selectedPlan: plan }),

      // 일정 관련
      setSchedules: (schedules) => set({ schedules }),
      addSchedule: (schedule) =>
        set((state) => ({ schedules: [...state.schedules, schedule] })),
      updateSchedule: (id, updatedSchedule) =>
        set((state) => ({
          schedules: state.schedules.map((s) =>
            s.id === id ? { ...s, ...updatedSchedule } : s
          ),
        })),
      removeSchedule: (id) =>
        set((state) => ({
          schedules: state.schedules.filter((s) => s.id !== id),
        })),

      // 로딩 상태
      setLoading: (loading) => set({ isLoading: loading }),
    }),
    {
      name: 'travel-app-storage',
      partialize: (state) => ({
        currentUser: state.currentUser, // 사용자 정보만 localStorage에 저장
      }),
    }
  )
);
