export type MealType = 'Breakfast' | 'Lunch' | 'Snacks' | 'Dinner';

export type DayMenu = {
  day: string;
  meals: Record<MealType, string[]>;
};

export const messMenu: DayMenu[] = [
  {
    day: 'Monday',
    meals: {
      Breakfast: ['Poha', 'Bread & Jam', 'Boiled Eggs', 'Tea/Coffee'],
      Lunch: ['Rajma', 'Steamed Rice', 'Roti', 'Salad', 'Curd'],
      Snacks: ['Samosa', 'Tea'],
      Dinner: ['Paneer Butter Masala', 'Roti', 'Jeera Rice', 'Gulab Jamun'],
    },
  },
  {
    day: 'Tuesday',
    meals: {
      Breakfast: ['Idli Sambar', 'Coconut Chutney', 'Tea/Coffee'],
      Lunch: ['Chole', 'Roti', 'Steamed Rice', 'Onion Salad', 'Buttermilk'],
      Snacks: ['Bread Pakora', 'Tea'],
      Dinner: ['Mix Veg', 'Dal Fry', 'Roti', 'Rice'],
    },
  },
  {
    day: 'Wednesday',
    meals: {
      Breakfast: ['Aloo Paratha', 'Curd', 'Pickle', 'Tea/Coffee'],
      Lunch: ['Kadhi Pakora', 'Rice', 'Roti', 'Salad'],
      Snacks: ['Vada Pav', 'Tea'],
      Dinner: ['Egg Curry / Paneer', 'Roti', 'Rice', 'Fruit Custard'],
    },
  },
  {
    day: 'Thursday',
    meals: {
      Breakfast: ['Upma', 'Boiled Eggs', 'Tea/Coffee'],
      Lunch: ['Dal Makhani', 'Jeera Rice', 'Roti', 'Salad', 'Curd'],
      Snacks: ['Dhokla', 'Tea'],
      Dinner: ['Bhindi Fry', 'Dal', 'Roti', 'Rice'],
    },
  },
  {
    day: 'Friday',
    meals: {
      Breakfast: ['Chole Bhature', 'Tea/Coffee'],
      Lunch: ['Rajma', 'Rice', 'Roti', 'Salad', 'Buttermilk'],
      Snacks: ['Sandwich', 'Tea'],
      Dinner: ['Veg Biryani', 'Raita', 'Papad', 'Ice Cream'],
    },
  },
  {
    day: 'Saturday',
    meals: {
      Breakfast: ['Paratha', 'Curd', 'Tea/Coffee'],
      Lunch: ['Kadhai Paneer', 'Roti', 'Rice', 'Salad'],
      Snacks: ['Pav Bhaji', 'Tea'],
      Dinner: ['Dal Tadka', 'Jeera Rice', 'Roti'],
    },
  },
  {
    day: 'Sunday',
    meals: {
      Breakfast: ['Puri Sabzi', 'Halwa', 'Tea/Coffee'],
      Lunch: ['Special Thali', 'Sweet', 'Papad'],
      Snacks: ['Pasta', 'Tea'],
      Dinner: ['Paneer Tikka Masala', 'Roti', 'Rice', 'Gulab Jamun'],
    },
  },
];

export function getTodayIndex(): number {
  const jsDay = new Date().getDay();
  return jsDay === 0 ? 6 : jsDay - 1;
}
