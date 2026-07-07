// Shelf-life knowledge base. Matched top-to-bottom, so more specific
// entries (e.g. "frozen", "almond milk") must come before generic ones
// ("milk"). Keywords also cover common receipt abbreviations.
// days = typical days until it should be used or tossed.

export const FOOD_DB = [
  // Anything explicitly frozen wins first
  { keywords: ['ice cream', 'icecream', 'popsicle', 'sorbet', 'gelato'], location: 'freezer', days: 60, emoji: '🍦' },
  { keywords: ['frozen', 'froz ', 'frz'], location: 'freezer', days: 90, emoji: '❄️' },

  // Shelf-stable packaged foods that can contain misleading fresh words
  { keywords: ['cereal', 'crl ', 'crunch berries', 'granola', 'oatmeal', 'oats', 'grits'], location: 'pantry', days: 180, emoji: '🥣' },
  { keywords: ['cheese puff', 'cheese puffs'], location: 'pantry', days: 60, emoji: '🍿' },
  { keywords: ['powder drink mix', 'drink mix', 'nesquik'], location: 'pantry', days: 180, emoji: '🥤' },
  { keywords: ['energy drink', 'drink cans', 'v8 energy'], location: 'pantry', days: 180, emoji: '🥤' },
  { keywords: ['syrup', 'maple'], location: 'pantry', days: 730, emoji: '🍯' },

  // Non-dairy "milks" and long-life dairy-ish (before generic milk)
  { keywords: ['almond milk', 'oat milk', 'soy milk', 'coconut milk', 'almond mlk', 'oat mlk'], location: 'fridge', days: 10, emoji: '🥛' },

  // Dairy & eggs
  { keywords: ['milk', 'mlk', 'whole mk', '2% mk'], location: 'fridge', days: 7, emoji: '🥛' },
  { keywords: ['yogurt', 'yoghurt', 'yogrt', 'ygrt'], location: 'fridge', days: 14, emoji: '🥣' },
  { keywords: ['cream cheese', 'crm chs'], location: 'fridge', days: 21, emoji: '🧀' },
  { keywords: ['sour cream', 'sr crm', 'sour crm'], location: 'fridge', days: 14, emoji: '🥣' },
  { keywords: ['whipping cream', 'heavy cream', 'half and half', 'half & half', 'creamer'], location: 'fridge', days: 10, emoji: '🥛' },
  { keywords: ['cheese', 'chees', 'chz', 'cheddar', 'mozzarella', 'mozz', 'parmesan', 'gouda', 'feta', 'brie'], location: 'fridge', days: 21, emoji: '🧀' },
  { keywords: ['butter', 'bttr', 'margarine'], location: 'fridge', days: 60, emoji: '🧈' },
  { keywords: ['egg', 'eggs', 'dozen eg'], location: 'fridge', days: 28, emoji: '🥚' },
  { keywords: ['tofu'], location: 'fridge', days: 7, emoji: '🍲' },

  // Fresh meat & seafood (short!)
  { keywords: ['ground beef', 'grnd beef', 'grnd bf', 'grd bf', 'gr beef', 'ground turkey', 'grnd trky', 'mince'], location: 'fridge', days: 2, emoji: '🥩' },
  { keywords: ['chicken', 'chkn', 'chick brst', 'drumstick', 'thigh'], location: 'fridge', days: 2, emoji: '🍗' },
  { keywords: ['beef', 'steak', 'sirloin', 'ribeye', 'roast beef', 'chuck roast', 'pot roast', 'rump roast'], location: 'fridge', days: 3, emoji: '🥩' },
  { keywords: ['pork', 'chop', 'ribs', 'tenderloin'], location: 'fridge', days: 3, emoji: '🍖' },
  { keywords: ['turkey', 'trky'], location: 'fridge', days: 2, emoji: '🦃' },
  { keywords: ['salmon', 'slmn', 'tilapia', 'cod ', 'shrimp', 'shrmp', 'fish', 'tuna steak', 'seafood', 'crab', 'scallop'], location: 'fridge', days: 2, emoji: '🐟' },
  { keywords: ['bacon', 'bcn'], location: 'fridge', days: 7, emoji: '🥓' },
  { keywords: ['sausage', 'sausg', 'brat', 'chorizo'], location: 'fridge', days: 4, emoji: '🌭' },
  { keywords: ['deli', 'ham ', 'sliced ham', 'salami', 'lunch meat', 'lunchmeat', 'prosciutto', 'pepperoni'], location: 'fridge', days: 5, emoji: '🥪' },
  { keywords: ['hot dog', 'hotdog', 'wiener', 'frank'], location: 'fridge', days: 14, emoji: '🌭' },

  // Produce — fridge
  { keywords: ['lettuce', 'lettc', 'romaine', 'spinach', 'spnch', 'arugula', 'kale', 'salad', 'spring mix', 'greens'], location: 'fridge', days: 5, emoji: '🥬' },
  { keywords: ['strawberr', 'strwb', 'raspberr', 'blackberr', 'berry', 'berries'], location: 'fridge', days: 3, emoji: '🍓' },
  { keywords: ['blueberr', 'blubry'], location: 'fridge', days: 7, emoji: '🫐' },
  { keywords: ['grape', 'grps'], location: 'fridge', days: 7, emoji: '🍇' },
  { keywords: ['apple', 'appl'], location: 'fridge', days: 30, emoji: '🍎' },
  { keywords: ['orange', 'orng', 'clementine', 'mandarin', 'grapefruit'], location: 'fridge', days: 14, emoji: '🍊' },
  { keywords: ['lemon', 'lime'], location: 'fridge', days: 21, emoji: '🍋' },
  { keywords: ['broccoli', 'brocc', 'cauliflower', 'califlr'], location: 'fridge', days: 7, emoji: '🥦' },
  { keywords: ['carrot', 'crrt'], location: 'fridge', days: 21, emoji: '🥕' },
  { keywords: ['celery', 'clry'], location: 'fridge', days: 14, emoji: '🥬' },
  { keywords: ['cucumber', 'cucmbr', 'cuke'], location: 'fridge', days: 7, emoji: '🥒' },
  { keywords: ['pepper', 'pppr', 'bell pep', 'jalapeno'], location: 'fridge', days: 7, emoji: '🫑' },
  { keywords: ['zucchini', 'squash', 'eggplant'], location: 'fridge', days: 5, emoji: '🍆' },
  { keywords: ['mushroom', 'mshrm', 'mushrm'], location: 'fridge', days: 5, emoji: '🍄' },
  { keywords: ['green bean', 'grn bean', 'asparagus', 'asprgs'], location: 'fridge', days: 4, emoji: '🫛' },
  { keywords: ['corn '], location: 'fridge', days: 3, emoji: '🌽' },
  { keywords: ['cilantro', 'parsley', 'basil', 'herb', 'green onion', 'grn onion', 'scallion'], location: 'fridge', days: 5, emoji: '🌿' },
  { keywords: ['avocado', 'avcado', 'avoc'], location: 'fridge', days: 4, emoji: '🥑' },
  { keywords: ['peach', 'plum', 'nectarine', 'pear', 'mango', 'kiwi', 'pineapple', 'melon', 'cantaloupe', 'watermelon', 'wtrmln'], location: 'fridge', days: 5, emoji: '🍑' },

  // Produce — counter/pantry
  { keywords: ['banana', 'bnna', 'bnn'], location: 'pantry', days: 5, emoji: '🍌' },
  { keywords: ['tomato', 'tmato', 'toma'], location: 'pantry', days: 5, emoji: '🍅' },
  { keywords: ['sweet potato', 'yam'], location: 'pantry', days: 21, emoji: '🍠' },
  { keywords: ['potato', 'ptato', 'russet', 'yukon'], location: 'pantry', days: 21, emoji: '🥔' },
  { keywords: ['onion', 'onin'], location: 'pantry', days: 30, emoji: '🧅' },
  { keywords: ['garlic', 'grlc'], location: 'pantry', days: 90, emoji: '🧄' },

  // Bakery
  { keywords: ['bread', 'brd ', 'loaf', 'baguette', 'bagel', 'bgl', 'bun', 'roll', 'croissant', 'muffin', 'english mfn'], location: 'pantry', days: 5, emoji: '🍞' },
  { keywords: ['tortilla', 'trtla', 'wrap', 'pita', 'naan'], location: 'pantry', days: 10, emoji: '🫓' },
  { keywords: ['cake', 'pie ', 'donut', 'pastry', 'cupcake', 'brownie'], location: 'pantry', days: 3, emoji: '🍰' },

  // Fridge condiments, drinks, misc
  { keywords: ['juice', 'juic', 'oj ', 'orange jce', 'lemonade'], location: 'fridge', days: 10, emoji: '🧃' },
  { keywords: ['hummus', 'hmms'], location: 'fridge', days: 7, emoji: '🥣' },
  { keywords: ['salsa', 'guacamole', 'guac'], location: 'fridge', days: 7, emoji: '🌶️' },
  { keywords: ['mayo', 'mayonnaise', 'mayonn'], location: 'fridge', days: 60, emoji: '🫙' },
  { keywords: ['ketchup', 'catsup', 'ktchp', 'mustard', 'mstrd', 'relish', 'bbq sauce', 'hot sauce', 'sriracha'], location: 'fridge', days: 180, emoji: '🫙' },
  { keywords: ['dressing', 'ranch', 'vinaigrette'], location: 'fridge', days: 60, emoji: '🥗' },
  { keywords: ['jam', 'jelly', 'preserves'], location: 'fridge', days: 90, emoji: '🫙' },
  { keywords: ['pickle', 'olive', 'sauerkraut', 'kimchi'], location: 'fridge', days: 90, emoji: '🫒' },
  { keywords: ['dough', 'pizza dough', 'biscuit dough', 'pillsbury'], location: 'fridge', days: 7, emoji: '🥐' },
  { keywords: ['dip ', 'queso'], location: 'fridge', days: 7, emoji: '🧀' },

  // Pantry staples — long life
  { keywords: ['rice', 'jasmine', 'basmati'], location: 'pantry', days: 365, emoji: '🍚' },
  { keywords: ['pasta sauce', 'alfredo', 'pesto', 'marinara'], location: 'pantry', days: 365, emoji: '🫙' },
  { keywords: ['pasta', 'spaghetti', 'spghtt', 'penne', 'macaroni', 'mac n', 'noodle', 'ramen'], location: 'pantry', days: 365, emoji: '🍝' },
  { keywords: ['cereal', 'crl ', 'granola', 'oatmeal', 'oats', 'grits'], location: 'pantry', days: 180, emoji: '🥣' },
  { keywords: ['flour', 'flr ', 'sugar', 'sgr ', 'baking soda', 'baking powder', 'yeast', 'cornstarch'], location: 'pantry', days: 365, emoji: '🌾' },
  { keywords: ['canned', 'cnd ', ' can ', 'soup', 'broth', 'stock', 'tomato sauce', 'tomato paste', 'beans can', 'black beans', 'chickpea', 'garbanzo', 'refried', 'tuna can', 'cnd tuna', 'canned tuna'], location: 'pantry', days: 365, emoji: '🥫' },
  { keywords: ['lentil', 'dried bean', 'quinoa', 'couscous', 'barley'], location: 'pantry', days: 365, emoji: '🫘' },
  { keywords: ['chip', 'chps', 'tortilla chip', 'pretzel', 'popcorn', 'cracker', 'crckr'], location: 'pantry', days: 60, emoji: '🍿' },
  { keywords: ['cookie', 'cooki', 'biscuit', 'granola bar', 'protein bar', 'candy', 'chocolate', 'choc '], location: 'pantry', days: 90, emoji: '🍪' },
  { keywords: ['peanut butter', 'pnt btr', 'pb ', 'nutella', 'almond butter'], location: 'pantry', days: 180, emoji: '🥜' },
  { keywords: ['oil', 'olive oil', 'canola', 'vegetable oil', 'evoo'], location: 'pantry', days: 365, emoji: '🫒' },
  { keywords: ['vinegar', 'soy sauce', 'worcestershire', 'fish sauce'], location: 'pantry', days: 365, emoji: '🫙' },
  { keywords: ['coffee', 'coff', 'espresso', 'tea ', 'teabag'], location: 'pantry', days: 365, emoji: '☕' },
  { keywords: ['spice', 'salt ', 'peppercorn', 'cumin', 'paprika', 'oregano', 'cinnamon', 'seasoning', 'ssnng'], location: 'pantry', days: 365, emoji: '🧂' },
  { keywords: ['nut ', 'nuts', 'almond', 'cashew', 'peanut', 'pistachio', 'walnut', 'pecan', 'trail mix'], location: 'pantry', days: 120, emoji: '🥜' },
  { keywords: ['raisin', 'dried fruit', 'date ', 'dates', 'craisin'], location: 'pantry', days: 180, emoji: '🍇' },
  { keywords: ['honey', 'syrup', 'maple'], location: 'pantry', days: 730, emoji: '🍯' },
  { keywords: ['soda', 'cola', 'sprite', 'pop ', 'seltzer', 'sparkling', 'la croix', 'lacroix'], location: 'pantry', days: 180, emoji: '🥤' },
  { keywords: ['water', 'wtr ', 'spring water'], location: 'pantry', days: 365, emoji: '💧' },
  { keywords: ['crouton', 'breadcrumb', 'panko'], location: 'pantry', days: 120, emoji: '🍞' },
];

// Fallback when nothing matches: assume pantry, two weeks.
export const DEFAULT_GUESS = { location: 'pantry', days: 14, emoji: '🛒' };
