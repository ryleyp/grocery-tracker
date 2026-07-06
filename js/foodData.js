// Shelf-life knowledge base. Matched top-to-bottom, so more specific
// entries (e.g. "frozen", "almond milk") must come before generic ones
// ("milk"). Keywords also cover common receipt abbreviations.
// days = typical days until it should be used or tossed.

export const FOOD_DB = [
  // Anything explicitly frozen wins first
  { keywords: ['frozen', 'froz ', 'frz', 'ice cream', 'icecream', 'popsicle', 'sorbet', 'gelato'], location: 'freezer', days: 90 },

  // Non-dairy "milks" and long-life dairy-ish (before generic milk)
  { keywords: ['almond milk', 'oat milk', 'soy milk', 'coconut milk', 'almond mlk', 'oat mlk'], location: 'fridge', days: 10 },

  // Dairy & eggs
  { keywords: ['milk', 'mlk', 'whole mk', '2% mk'], location: 'fridge', days: 7 },
  { keywords: ['yogurt', 'yoghurt', 'yogrt', 'ygrt'], location: 'fridge', days: 14 },
  { keywords: ['cream cheese', 'crm chs'], location: 'fridge', days: 21 },
  { keywords: ['sour cream', 'sr crm', 'sour crm'], location: 'fridge', days: 14 },
  { keywords: ['whipping cream', 'heavy cream', 'half and half', 'half & half', 'creamer'], location: 'fridge', days: 10 },
  { keywords: ['cheese', 'chees', 'chz', 'cheddar', 'mozzarella', 'mozz', 'parmesan', 'gouda', 'feta', 'brie'], location: 'fridge', days: 21 },
  { keywords: ['butter', 'bttr', 'margarine'], location: 'fridge', days: 60 },
  { keywords: ['egg', 'eggs', 'dozen eg'], location: 'fridge', days: 28 },
  { keywords: ['tofu'], location: 'fridge', days: 7 },

  // Fresh meat & seafood (short!)
  { keywords: ['ground beef', 'grnd beef', 'grnd bf', 'grd bf', 'gr beef', 'ground turkey', 'grnd trky', 'mince'], location: 'fridge', days: 2 },
  { keywords: ['chicken', 'chkn', 'chick brst', 'drumstick', 'thigh'], location: 'fridge', days: 2 },
  { keywords: ['beef', 'steak', 'sirloin', 'ribeye', 'roast'], location: 'fridge', days: 3 },
  { keywords: ['pork', 'chop', 'ribs', 'tenderloin'], location: 'fridge', days: 3 },
  { keywords: ['turkey', 'trky'], location: 'fridge', days: 2 },
  { keywords: ['salmon', 'slmn', 'tilapia', 'cod ', 'shrimp', 'shrmp', 'fish', 'tuna steak', 'seafood', 'crab', 'scallop'], location: 'fridge', days: 2 },
  { keywords: ['bacon', 'bcn'], location: 'fridge', days: 7 },
  { keywords: ['sausage', 'sausg', 'brat', 'chorizo'], location: 'fridge', days: 4 },
  { keywords: ['deli', 'ham ', 'sliced ham', 'salami', 'lunch meat', 'lunchmeat', 'prosciutto', 'pepperoni'], location: 'fridge', days: 5 },
  { keywords: ['hot dog', 'hotdog', 'wiener', 'frank'], location: 'fridge', days: 14 },

  // Produce — fridge
  { keywords: ['lettuce', 'lettc', 'romaine', 'spinach', 'spnch', 'arugula', 'kale', 'salad', 'spring mix', 'greens'], location: 'fridge', days: 5 },
  { keywords: ['strawberr', 'strwb', 'raspberr', 'blackberr', 'berry', 'berries'], location: 'fridge', days: 3 },
  { keywords: ['blueberr', 'blubry'], location: 'fridge', days: 7 },
  { keywords: ['grape', 'grps'], location: 'fridge', days: 7 },
  { keywords: ['apple', 'appl'], location: 'fridge', days: 30 },
  { keywords: ['orange', 'orng', 'clementine', 'mandarin', 'grapefruit'], location: 'fridge', days: 14 },
  { keywords: ['lemon', 'lime'], location: 'fridge', days: 21 },
  { keywords: ['broccoli', 'brocc', 'cauliflower', 'califlr'], location: 'fridge', days: 7 },
  { keywords: ['carrot', 'crrt'], location: 'fridge', days: 21 },
  { keywords: ['celery', 'clry'], location: 'fridge', days: 14 },
  { keywords: ['cucumber', 'cucmbr', 'cuke'], location: 'fridge', days: 7 },
  { keywords: ['pepper', 'pppr', 'bell pep', 'jalapeno'], location: 'fridge', days: 7 },
  { keywords: ['zucchini', 'squash', 'eggplant'], location: 'fridge', days: 5 },
  { keywords: ['mushroom', 'mshrm', 'mushrm'], location: 'fridge', days: 5 },
  { keywords: ['green bean', 'grn bean', 'asparagus', 'asprgs'], location: 'fridge', days: 4 },
  { keywords: ['corn '], location: 'fridge', days: 3 },
  { keywords: ['cilantro', 'parsley', 'basil', 'herb', 'green onion', 'grn onion', 'scallion'], location: 'fridge', days: 5 },
  { keywords: ['avocado', 'avcado', 'avoc'], location: 'fridge', days: 4 },
  { keywords: ['peach', 'plum', 'nectarine', 'pear', 'mango', 'kiwi', 'pineapple', 'melon', 'cantaloupe', 'watermelon', 'wtrmln'], location: 'fridge', days: 5 },

  // Produce — counter/pantry
  { keywords: ['banana', 'bnna', 'bnn'], location: 'pantry', days: 5 },
  { keywords: ['tomato', 'tmato', 'toma'], location: 'pantry', days: 5 },
  { keywords: ['potato', 'ptato', 'russet', 'yukon'], location: 'pantry', days: 21 },
  { keywords: ['sweet potato', 'yam'], location: 'pantry', days: 21 },
  { keywords: ['onion', 'onin'], location: 'pantry', days: 30 },
  { keywords: ['garlic', 'grlc'], location: 'pantry', days: 90 },

  // Bakery
  { keywords: ['bread', 'brd ', 'loaf', 'baguette', 'bagel', 'bgl', 'bun', 'roll', 'croissant', 'muffin', 'english mfn'], location: 'pantry', days: 5 },
  { keywords: ['tortilla', 'trtla', 'wrap', 'pita', 'naan'], location: 'pantry', days: 10 },
  { keywords: ['cake', 'pie ', 'donut', 'pastry', 'cupcake', 'brownie'], location: 'pantry', days: 3 },

  // Fridge condiments, drinks, misc
  { keywords: ['juice', 'juic', 'oj ', 'orange jce', 'lemonade'], location: 'fridge', days: 10 },
  { keywords: ['hummus', 'hmms'], location: 'fridge', days: 7 },
  { keywords: ['salsa', 'guacamole', 'guac', 'dip'], location: 'fridge', days: 7 },
  { keywords: ['mayo', 'mayonnaise', 'mayonn'], location: 'fridge', days: 60 },
  { keywords: ['ketchup', 'catsup', 'ktchp', 'mustard', 'mstrd', 'relish', 'bbq sauce', 'hot sauce', 'sriracha'], location: 'fridge', days: 180 },
  { keywords: ['dressing', 'ranch', 'vinaigrette'], location: 'fridge', days: 60 },
  { keywords: ['jam', 'jelly', 'preserves'], location: 'fridge', days: 90 },
  { keywords: ['pickle', 'olive', 'sauerkraut', 'kimchi'], location: 'fridge', days: 90 },
  { keywords: ['dough', 'pizza dough', 'biscuit dough', 'pillsbury'], location: 'fridge', days: 7 },
  { keywords: ['dip ', 'queso'], location: 'fridge', days: 7 },

  // Pantry staples — long life
  { keywords: ['rice', 'jasmine', 'basmati'], location: 'pantry', days: 365 },
  { keywords: ['pasta', 'spaghetti', 'spghtt', 'penne', 'macaroni', 'mac n', 'noodle', 'ramen'], location: 'pantry', days: 365 },
  { keywords: ['cereal', 'crl ', 'granola', 'oatmeal', 'oats', 'grits'], location: 'pantry', days: 180 },
  { keywords: ['flour', 'flr ', 'sugar', 'sgr ', 'baking soda', 'baking powder', 'yeast', 'cornstarch'], location: 'pantry', days: 365 },
  { keywords: ['canned', 'cnd ', ' can ', 'soup', 'broth', 'stock', 'tomato sauce', 'tomato paste', 'marinara', 'beans can', 'black beans', 'chickpea', 'garbanzo', 'refried', 'tuna can', 'cnd tuna', 'canned tuna'], location: 'pantry', days: 365 },
  { keywords: ['lentil', 'dried bean', 'quinoa', 'couscous', 'barley'], location: 'pantry', days: 365 },
  { keywords: ['chip', 'chps', 'tortilla chip', 'pretzel', 'popcorn', 'cracker', 'crckr'], location: 'pantry', days: 60 },
  { keywords: ['cookie', 'cooki', 'biscuit', 'granola bar', 'protein bar', 'candy', 'chocolate', 'choc '], location: 'pantry', days: 90 },
  { keywords: ['peanut butter', 'pnt btr', 'pb ', 'nutella', 'almond butter'], location: 'pantry', days: 180 },
  { keywords: ['oil', 'olive oil', 'canola', 'vegetable oil', 'evoo'], location: 'pantry', days: 365 },
  { keywords: ['vinegar', 'soy sauce', 'worcestershire', 'fish sauce'], location: 'pantry', days: 365 },
  { keywords: ['coffee', 'coff', 'espresso', 'tea ', 'teabag'], location: 'pantry', days: 365 },
  { keywords: ['spice', 'salt', 'peppercorn', 'cumin', 'paprika', 'oregano', 'cinnamon', 'seasoning', 'ssnng'], location: 'pantry', days: 365 },
  { keywords: ['nut ', 'nuts', 'almond', 'cashew', 'peanut', 'pistachio', 'walnut', 'pecan', 'trail mix'], location: 'pantry', days: 120 },
  { keywords: ['raisin', 'dried fruit', 'date ', 'dates', 'craisin'], location: 'pantry', days: 180 },
  { keywords: ['honey', 'syrup', 'maple'], location: 'pantry', days: 730 },
  { keywords: ['soda', 'cola', 'sprite', 'pop ', 'seltzer', 'sparkling', 'la croix', 'lacroix'], location: 'pantry', days: 180 },
  { keywords: ['water', 'wtr ', 'spring water'], location: 'pantry', days: 365 },
  { keywords: ['salsa jar', 'pasta sauce', 'alfredo', 'pesto'], location: 'pantry', days: 365 },
  { keywords: ['crouton', 'breadcrumb', 'panko'], location: 'pantry', days: 120 },
  { keywords: ['salsa verde'], location: 'pantry', days: 365 },
];

// Fallback when nothing matches: assume pantry, two weeks.
export const DEFAULT_GUESS = { location: 'pantry', days: 14 };
