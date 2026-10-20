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
  // Saturday (6) and Sunday (0) have no entry in messMenu above — it's
  // Monday-Friday only. Returning -1 for a weekend is a deliberate
  // sentinel ("no day selected"), not a bug: MessMenuScreen.tsx checks
  // for exactly this and shows a "no menu on weekends" message instead
  // of indexing into the array with it. Previously this returned 5/6
  // directly, which is out of bounds for a 5-item array and crashed
  // the whole screen with "Cannot read property 'meals' of undefined"
  // every Saturday and Sunday, with no weekend tab to tap back out of.
  if (jsDay === 0 || jsDay === 6) return -1;
  return jsDay - 1;
}
