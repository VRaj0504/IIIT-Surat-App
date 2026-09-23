export type MealType ='Lunch';

export type DayMenu = {
  day: string;
  meals: Record<MealType, string[]>;
};

export const messMenu: DayMenu[] = [
  {
    day: 'Monday',
    meals: {
      Lunch: ['Kadhai Paneer/Butter Paneer Masala', 'Steam Rice','Tuver Dal', 'Chapati', 'Salad & Pickle', 'Chaas'],
    },
  },
  {
    day: 'Tuesday',
    meals: {
      Lunch: ['Bhindi Masala', 'Chana Dal', 'Jeera Rice','Paratha', 'Salad & Pickle', 'Curd'],
    },
  },
  {
    day: 'Wednesday',
    meals: {
      Lunch: ['Chole(Kabuli Chana)', 'Pulao', 'Poori', 'Salad & Pickle', 'Sweet(Gulab Jamun)'],
    },
  },
  {
    day: 'Thursday',
    meals: {
      Lunch: ['Dum Aloo', 'Jeera Rice', 'Kadhi', 'Salad & Pickle', 'Chapati'],
    },
  },
  {
    day: 'Friday',
    meals: {
      Lunch: ['Mix Vegetable', 'Matar Rice', 'Rajma', 'Chapati', 'Salad & Pickle', 'Chaas'],
    },
  },
];

export function getTodayIndex(): number {
  const jsDay = new Date().getDay();
  return jsDay === 0 ? 6 : jsDay - 1;
}
