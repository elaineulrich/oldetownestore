// Initial data for a fresh database. Menu items and prices were taken from the
// store's existing order forms and bakery price list; everything here can be
// changed afterwards from the admin panel.

const MEATS = [
  'Ham', 'Turkey', 'Hard Salami', 'Pepperoni', 'Liverwurst', 'Cooked Ham', 'Off the Bone Ham',
  'Off the Bone Honey Ham', 'Black Forest Ham', 'Brown Sugar Ham', 'Beef Bologna',
  'German Bologna', 'Lebanon Bologna', 'Sweet Lebanon Bologna', 'Honey Roasted Turkey',
  'Tavern Smoked Turkey', 'Turkey Breast', 'Cajun Turkey', 'Peppered Turkey',
  'Buffalo Style Chicken', 'Roast Beef', 'Corned Beef', 'Beef Pastrami',
  'Pickle & Pimento Loaf', 'Teriyaki Chicken', 'Rotisserie Chicken', 'BBQ Pulled Pork',
  'Chicken Salad', 'Bacon', 'Cooked Salami',
];

const CHEESES = [
  'Yellow American', 'Cooper Sharp American', 'Colby', 'Cheddar', 'Green Onion',
  'Country Bacon Cheese', 'Marble', 'Farmers', 'Havarti', 'Mozzarella', 'Pepper Jack',
  'Sharp Cheddar', 'Habanero/Jalapeño Cheddar', 'Horseradish Cheddar', 'Smoked Cheddar',
  'Provolone', 'Baby Swiss', 'Swiss Cuts', 'Muenster', 'Muenster Jalapeño', 'Garlic & Herb',
];

const BREADS = [
  'Jalapeño Cheese Bread', 'White Bun', 'Wheat Bun', 'White Wrap', 'Wheat Wrap',
  'Garlic & Herb Wrap', 'Jalapeño Cheese Wrap', 'Kids White Sliced Bread', 'White Sub', 'Wheat Sub',
];

const CONDIMENTS = ['Mayo', 'Miracle Whip', 'Ranch', 'Italian', 'Mustard', 'Parmesan & Oregano'];
const VEGGIES = ['Lettuce', 'Tomato', 'Onion', 'Jalapeño', 'Pickle', 'Olive', 'Banana Pepper'];

// Meats the sandwich/wrap form offers (subs and trays use slightly different lists).
const SANDWICH_MEATS = MEATS.filter((m) => !['Ham', 'Turkey', 'Teriyaki Chicken'].includes(m));
const SANDWICH_EXTRA_MEATS = MEATS.filter((m) => !['Ham', 'Turkey', 'Rotisserie Chicken', 'Cooked Salami'].includes(m));
const SUB_BASIC_MEATS = ['Ham', 'Turkey', 'Roast Beef'];
const SUB_PREMIUM_MEATS = MEATS.filter(
  (m) => !['Ham', 'Turkey', 'Roast Beef', 'Cooked Ham', 'Tavern Smoked Turkey', 'Turkey Breast',
    'Rotisserie Chicken', 'Cooked Salami'].includes(m)
);
const SUB_EXTRA_MEATS = MEATS.filter((m) => !['Cooked Ham', 'Turkey Breast', 'Teriyaki Chicken'].includes(m));
const SUB_BASIC_CHEESES = ['Yellow American', 'Colby', 'Pepper Jack'];
const TRAY_MEATS = MEATS.filter(
  (m) => !['Ham', 'Turkey', 'Teriyaki Chicken', 'BBQ Pulled Pork', 'Chicken Salad', 'Bacon', 'Cooked Salami'].includes(m)
);

const BAKERY = [
  ['Bread', '', [
    ['Jalapeño Bread, Large', 6.99], ['Jalapeño Bread, Small', 3.99],
    ['Sourdough White Bread, Large', 4.59], ['Sourdough White Bread, Small', 2.99],
    ['Sourdough Wheat Bread, Large', 5.99], ['Sourdough Wheat Bread, Small', 3.99],
    ['Cheese Bread, Large', 6.99], ['Cheese Bread, Small', 3.99],
    ['Cinnamon Raisin Bread, Large', 5.99], ['Cinnamon Raisin Bread, Small', 3.99],
    ['Cinnamon Toast Bread', 4.69],
  ]],
  ['Buns, Subs & Wraps', '', [
    ['Sourdough White Bun, Small (each)', 1.5], ['Sourdough Wheat Bun, Small (each)', 1.5],
    ['White Sub, Large (each)', 2], ['Wheat Sub, Large (each)', 2],
  ]],
  ['Sweet Breads', '', [
    ['Apple Bread, Large', 6.49], ['Cream Cheese Pound Cake', 6.49], ['Banana Nut Bread', 6.49],
    ['Pumpkin Bread', 6.49], ['Zucchini Bread', 6.49],
  ]],
  ['Dinner Rolls', '', [['Dinner Rolls, Dozen', 4.99], ['Dinner Rolls, 6 Pack', 2.99]]],
  ['Whoopie Pies & Brownies', '', [
    ['Chocolate Whoopie Pie', 3.49], ['Pumpkin Whoopie Pie', 3.49], ['Brownie', 2.39],
    ['Unwrapped Brownies, 24 Count', 38],
  ]],
  ['Cookies', '', [
    ['Chocolate Chip Cookies, Dozen', 8.29], ['Chocolate Chip Cookies, Half Dozen', 5.49],
    ['Chocolate Chip Cookies, 2 Pack', 2.49], ['Raisin Oatmeal Cookies, Dozen', 6.99],
    ['Monster Cookies, Dozen', 6.99], ['Peanut Butter Cookies, Dozen', 8.29],
    ['Peanut Butter Cookies, Half Dozen', 5.49], ['Peanut Butter Cookies, 2 Pack', 2.49],
    ['Sugar Cookies, Dozen', 8.29], ['Sugar Cookies, Half Dozen', 5.49], ['Sugar Cookies, 2 Pack', 2.49],
    ['Snickerdoodle Cookies, Dozen', 8.29], ['Snickerdoodle Cookies, Half Dozen', 5.49],
    ['Snickerdoodle Cookies, 2 Pack', 2.49],
  ]],
  ['Cakes', '', [['Carrot Cake, 9x13 (special order)', 21.99], ['Carrot Cake', 7.99]]],
  ['Large Pies', '', [
    ['Apple', 20], ['Buttermilk', 16], ['French Coconut', 16], ['Peach', 20], ['Lemon Chess', 16],
    ['Pecan', 16], ['Chocolate Pecan', 20], ['Cherry', 20], ['Apricot', 20], ['Sweet Potato', 16],
    ['Pumpkin', 16], ['Strawberry', 20], ['Lemon Meringue', 20], ['Chocolate Crème, Cool Whip', 16],
    ['Chocolate Crème, Meringue', 20], ['Coconut Crème, Cool Whip', 16], ['Coconut Crème, Meringue', 20],
  ]],
  ['Fried Pies', '', [
    'Apple', 'Peach', 'Apricot', 'Pineapple', 'Lemon', 'Cherry', 'Blueberry', 'Pecan', 'Chocolate',
    'Coconut', 'Sugar Free Apple', 'Sugar Free Peach', 'Sugar Free Apricot', 'Sugar Free Cherry',
  ].map((f) => [f, 2.99])],
  ['Granola', '', [
    ['Almond Delight Granola', 5.95], ['Pecan Crunch Granola', 5.95],
    ['Sugar Free Organic Pecan Granola', 6.95],
  ]],
  ['Cinnamon Rolls & Sticky Buns', '', [['Cinnamon Rolls, Large', 6.99], ['Cinnamon Rolls, Small', 2.99]]],
  ['Coffee Cakes', '', [['Cinnamon Walnut Coffee Cake', 8.99], ['Blueberry Coffee Cake', 8.99]]],
];

export const DEFAULT_SETTINGS = {
  store_name: 'Olde Towne Country Store',
  tagline: 'Your hometown deli, bakery & bulk grocery in Itasca, Texas',
  address: '102 West Main Street, Itasca, TX 76055',
  phone: '254-687-5052',
  email: '',
  facebook_url: 'https://www.facebook.com/Olde-Towne-Country-Store-259449031293300/',
  newsletter_url: 'https://facebook.us18.list-manage.com/subscribe?u=c22d45773adfd5ea403d9d9f8&id=b66f9c8b94',
  timezone: 'America/Chicago',
  // 0 = Sunday ... 6 = Saturday; null = closed
  hours: [
    null,
    { open: '08:00', close: '17:30' },
    { open: '08:00', close: '17:30' },
    { open: '08:00', close: '17:30' },
    { open: '08:00', close: '18:00' },
    { open: '08:00', close: '18:00' },
    { open: '09:00', close: '16:00' },
  ],
  closed_dates: [],
  deli_ordering_enabled: true,
  tray_ordering_enabled: true,
  close_cutoff_minutes: 15,
  announcement: '',
};

export function seed(db) {
  const ins = {
    setting: db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)'),
    ingredient: db.prepare('INSERT INTO ingredients (category, name, sort) VALUES (?, ?, ?)'),
    product: db.prepare(
      'INSERT INTO products (kind, name, description, base_price, lead_minutes, max_advance_days, sort) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ),
    group: db.prepare(
      'INSERT INTO option_groups (product_id, name, help, min_select, max_select, sort) VALUES (?, ?, ?, ?, ?, ?)'
    ),
    option: db.prepare('INSERT INTO options (group_id, name, price, ingredient_id, sort) VALUES (?, ?, ?, ?, ?)'),
    bakeryCat: db.prepare('INSERT INTO bakery_categories (name, note, sort) VALUES (?, ?, ?)'),
    bakeryItem: db.prepare('INSERT INTO bakery_items (category_id, name, price, sort) VALUES (?, ?, ?, ?)'),
  };

  db.exec('BEGIN');
  try {
    for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) ins.setting.run(k, JSON.stringify(v));

    const ingredientId = {};
    const lists = { Bread: BREADS, Condiment: CONDIMENTS, Meat: MEATS, Cheese: CHEESES, Veggie: VEGGIES };
    for (const [category, names] of Object.entries(lists)) {
      names.forEach((name, i) => {
        ingredientId[`${category}:${name}`] = Number(ins.ingredient.run(category, name, i).lastInsertRowid);
      });
    }

    let productSort = 0;
    const addProduct = (p, groups) => {
      const pid = Number(
        ins.product.run(p.kind, p.name, p.description, p.base_price, p.lead_minutes, p.max_advance_days, productSort++)
          .lastInsertRowid
      );
      groups.forEach((g, gi) => {
        const gid = Number(ins.group.run(pid, g.name, g.help || '', g.min, g.max, gi).lastInsertRowid);
        g.options.forEach(([name, price, category], oi) => {
          const ing = category ? ingredientId[`${category}:${name}`] ?? null : null;
          ins.option.run(gid, name, price, ing, oi);
        });
      });
    };
    const opts = (names, category, price = 0) => names.map((n) => [n, price, category]);

    addProduct(
      {
        kind: 'deli', name: 'Sandwich or Wrap',
        description: 'Built to order on our fresh-baked buns, jalapeño cheese bread, or a wrap.',
        base_price: null, lead_minutes: 15, max_advance_days: 7,
      },
      [
        { name: 'Bread', min: 1, max: 1, options: opts(BREADS.filter((b) => !b.includes('Sub')), 'Bread') },
        { name: 'Condiments', min: 0, max: 0, options: opts(CONDIMENTS, 'Condiment') },
        { name: 'Meat', help: 'One meat is included.', min: 0, max: 1, options: opts(SANDWICH_MEATS, 'Meat') },
        { name: 'Extra Meat', min: 0, max: 0, options: opts(SANDWICH_EXTRA_MEATS, 'Meat', 2) },
        { name: 'Cheese', help: 'One cheese is included.', min: 0, max: 1, options: opts(CHEESES, 'Cheese') },
        { name: 'Extra Cheese', min: 0, max: 0, options: opts(CHEESES, 'Cheese', 2) },
        { name: 'Veggies', min: 0, max: 0, options: opts(VEGGIES, 'Veggie') },
      ]
    );

    addProduct(
      {
        kind: 'deli', name: 'Sub',
        description: 'A 6" or 12" sub on our house-baked white or wheat roll.',
        base_price: null, lead_minutes: 15, max_advance_days: 7,
      },
      [
        { name: 'Bread', min: 1, max: 1, options: opts(['White Sub', 'Wheat Sub'], 'Bread') },
        { name: 'Size', min: 1, max: 1, options: [['6"', 0, null], ['12"', 0, null]] },
        { name: 'Condiments', min: 0, max: 0, options: opts(CONDIMENTS, 'Condiment') },
        {
          name: 'Meat', help: 'Ham, turkey, and roast beef are included; specialty meats add 50¢.', min: 0, max: 1,
          options: [...opts(SUB_BASIC_MEATS, 'Meat'), ...opts(SUB_PREMIUM_MEATS, 'Meat', 0.5)],
        },
        { name: 'Extra Meat', min: 0, max: 0, options: opts(SUB_EXTRA_MEATS, 'Meat', 3) },
        {
          name: 'Cheese', help: 'American, Colby, and Pepper Jack are included; specialty cheeses add 50¢.', min: 0, max: 1,
          options: [
            ...opts(SUB_BASIC_CHEESES, 'Cheese'),
            ...opts(CHEESES.filter((c) => !SUB_BASIC_CHEESES.includes(c)), 'Cheese', 0.5),
          ],
        },
        { name: 'Extra Cheese', min: 0, max: 0, options: opts(CHEESES, 'Cheese', 3) },
        { name: 'Veggies', min: 0, max: 0, options: opts(VEGGIES, 'Veggie') },
      ]
    );

    addProduct(
      {
        kind: 'tray', name: 'Deli Meat & Cheese Tray',
        description: 'Your choice of up to three meats and three cheeses, sliced or cubed and arranged on a platter.',
        base_price: 0, lead_minutes: 24 * 60, max_advance_days: 60,
      },
      [
        {
          name: 'Size', min: 1, max: 1,
          options: [['5 lb (feeds 15–20)', 45, null], ['6 lb (feeds 20–25)', 54, null],
            ['7 lb (feeds 25–30)', 63, null], ['10 lb (feeds 40–45)', 87, null]],
        },
        { name: 'Style', min: 1, max: 1, options: [['Sliced', 0, null], ['Cubed', 0, null]] },
        { name: 'Meats', help: 'Choose up to 3.', min: 1, max: 3, options: opts(TRAY_MEATS, 'Meat') },
        { name: 'Cheeses', help: 'Choose up to 3.', min: 1, max: 3, options: opts(CHEESES, 'Cheese') },
      ]
    );

    BAKERY.forEach(([cat, note, items], ci) => {
      const cid = Number(ins.bakeryCat.run(cat, note, ci).lastInsertRowid);
      items.forEach(([name, price], ii) => ins.bakeryItem.run(cid, name, price, ii));
    });

    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}
