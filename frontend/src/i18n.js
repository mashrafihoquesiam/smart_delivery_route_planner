import { Children, cloneElement, Fragment, isValidElement } from 'react'

const bn = {
  Planner: 'রুট পরিকল্পনা', Dashboard: 'ড্যাশবোর্ড', 'Rider Profile': 'রাইডার প্রোফাইল', 'Log out': 'লগ আউট',
  'Planner online': 'প্ল্যানার অনলাইন', 'Planner needs attention': 'প্ল্যানার পরীক্ষা করুন', 'Connecting to planner': 'প্ল্যানারের সাথে সংযোগ হচ্ছে', 'Calculating route': 'রুট গণনা হচ্ছে', 'Backend unavailable': 'ব্যাকএন্ড সংযোগ বিচ্ছিন্ন',
  'Service health': 'সেবার অবস্থা', 'All systems operational': 'সব সিস্টেম সচল', 'Check required': 'পরীক্ষা প্রয়োজন', 'Backend API': 'ব্যাকএন্ড API', Responding: 'সাড়া দিচ্ছে', 'Not reachable': 'সংযোগ করা যাচ্ছে না', 'Risk model': 'ঝুঁকি মডেল', 'Loaded in memory': 'চালু আছে', 'Ready to load': 'চালুর জন্য প্রস্তুত', 'Model file missing': 'মডেল ফাইল নেই', 'Dhaka road graph': 'ঢাকার সড়ক নেটওয়ার্ক', Available: 'উপলভ্য', Missing: 'অনুপস্থিত', 'Delivery database': 'ডেলিভারি ডেটাবেস', Connected: 'সংযুক্ত', Unavailable: 'অনুপলভ্য', 'Close service status': 'সেবার অবস্থা বন্ধ করুন', 'Service details': 'সেবার বিস্তারিত',
  'Dhaka delivery intelligence': 'ঢাকার ডেলিভারি ব্যবস্থাপনা', 'Route studio': 'রুট পরিকল্পনা', 'Plan a delivery': 'ডেলিভারি পরিকল্পনা', 'Set the trip context and let risk-aware routing find the better road.': 'যাত্রার তথ্য দিন, ঝুঁকি-সচেতন রুট আপনাকে উপযুক্ত পথ খুঁজে দেবে।', 'Pickup from': 'যেখান থেকে সংগ্রহ', 'Deliver to': 'যেখানে পৌঁছাবেন', Weather: 'আবহাওয়া', Vehicle: 'যানবাহন', Hour: 'সময়', Month: 'মাস', 'Route preference': 'রুটের পছন্দ', 'Fastest arrival': 'দ্রুততম পৌঁছানো', 'Shortest distance': 'সবচেয়ে কম দূরত্ব', 'Avoid toll roads': 'টোল সড়ক এড়িয়ে চলুন', 'Prioritize lower-risk roads': 'কম ঝুঁকির সড়ক বেছে নিন', Stops: 'যাত্রাবিরতি', 'optional, order optimized': 'ঐচ্ছিক, ক্রম সাজানো হবে', 'Calculate smart route': 'স্মার্ট রুট হিসাব করুন', 'Choose two different locations.': 'দুটি ভিন্ন স্থান নির্বাচন করুন।', 'Evaluating road network...': 'সড়ক নেটওয়ার্ক বিশ্লেষণ হচ্ছে...', 'Route ready to dispatch.': 'রুট ডেলিভারির জন্য প্রস্তুত।', 'Could not load delivery locations.': 'ডেলিভারির স্থান লোড করা যায়নি।', 'Unknown location.': 'স্থানটি পাওয়া যায়নি।',
  'Context-aware planning': 'প্রাসঙ্গিক তথ্যভিত্তিক পরিকল্পনা', 'Built for safer delivery decisions': 'নিরাপদ ডেলিভারি সিদ্ধান্তের জন্য তৈরি', 'Live route overview': 'রুটের সরাসরি সারসংক্ষেপ', 'Ready for your next delivery': 'পরবর্তী ডেলিভারির জন্য প্রস্তুত', 'Choose two locations to see a risk-aware recommendation.': 'ঝুঁকি-সচেতন পরামর্শ পেতে দুটি স্থান নির্বাচন করুন।', Distance: 'দূরত্ব', 'Route cost': 'রুটের খরচ', 'Risk edges': 'ঝুঁকিপূর্ণ সড়কাংশ', 'estimated road distance': 'আনুমানিক সড়ক দূরত্ব', 'risk-weighted meters': 'ঝুঁকি-সমন্বিত মিটার', 'segments evaluated': 'বিশ্লেষিত সড়কাংশ', 'Planning mode': 'পরিকল্পনা পদ্ধতি', Smart: 'স্মার্ট', 'context-aware route': 'প্রাসঙ্গিক তথ্যভিত্তিক রুট', 'Dhaka road network': 'ঢাকার সড়ক নেটওয়ার্ক', 'Route updates with your trip context': 'যাত্রার তথ্য অনুযায়ী রুট হালনাগাদ হবে', 'Your route will appear here': 'আপনার রুট এখানে দেখা যাবে', 'Calculate a route to explore the safest path.': 'নিরাপদ পথ দেখতে রুট গণনা করুন।', 'Recommended route': 'প্রস্তাবিত রুট', Pickup: 'সংগ্রহ', Delivery: 'ডেলিভারি', 'Route intelligence': 'রুট বিশ্লেষণ', 'Why this route?': 'এই রুট কেন?', 'Your route explanation and risk mix will show here after calculation.': 'রুট গণনার পর ব্যাখ্যা ও ঝুঁকির বিবরণ এখানে দেখা যাবে।', 'Road segment mix': 'সড়কাংশের ঝুঁকি', Low: 'কম', Medium: 'মাঝারি', High: 'বেশি', 'Delivery safety': 'ডেলিভারির নিরাপত্তা', Pending: 'অপেক্ষমাণ', 'Awaiting route': 'রুটের অপেক্ষায়',
  'The route balances distance with road safety.': 'রুটটি দূরত্ব ও সড়ক নিরাপত্তার মধ্যে ভারসাম্য রাখে।', 'A clear run with no high-risk segments detected.': 'রুটে উচ্চ ঝুঁকির সড়কাংশ পাওয়া যায়নি।', 'Live tracking': 'সরাসরি অবস্থান', 'Current Driver Location': 'চালকের বর্তমান অবস্থান', 'Location permission is required to enable live tracking.': 'সরাসরি অবস্থান চালু করতে লোকেশন অনুমতি দিন।', 'Enable GPS tracking': 'GPS ট্র্যাকিং চালু করুন', 'Refresh GPS': 'GPS হালনাগাদ করুন', 'GPS refreshed from the device': 'ডিভাইস থেকে GPS হালনাগাদ হয়েছে', 'Estimated arrival': 'আনুমানিক পৌঁছানোর সময়', 'ETA estimate': 'পৌঁছানোর আনুমানিক সময়', 'Waiting for route': 'রুটের অপেক্ষায়', 'Estimated using route distance and average vehicle speed. Not live traffic.': 'রুটের দূরত্ব ও গড় গতির ভিত্তিতে হিসাব। সরাসরি ট্রাফিক নয়।', 'Delivery progress': 'ডেলিভারির অগ্রগতি', 'Delivery Progress': 'ডেলিভারির অগ্রগতি', 'Enable GPS tracking to estimate route progress and delivery status.': 'রুটের অগ্রগতি ও ডেলিভারির অবস্থা জানতে GPS চালু করুন।', 'complete': 'সম্পন্ন', 'Completed': 'সম্পন্ন', 'Remaining': 'বাকি', 'km remaining': 'কিমি বাকি', 'Route comparison': 'রুটের তুলনা', 'Fastest vs safer route': 'দ্রুততম ও নিরাপদ রুট', 'Current route': 'বর্তমান রুট', 'Faster route': 'দ্রুততর রুট', 'Safer route': 'নিরাপদতর রুট', Risk: 'ঝুঁকি', ETA: 'পৌঁছানোর সময়', Cost: 'খরচ',
  'Operations center': 'পরিচালনা কেন্দ্র', 'Delivery overview': 'ডেলিভারির সারসংক্ষেপ', 'A live view of orders, route performance, and driver capacity.': 'অর্ডার, রুটের কার্যকারিতা ও চালকের সক্ষমতার সরাসরি চিত্র।', 'Today · Dhaka': 'আজ · ঢাকা', 'Total deliveries': 'মোট ডেলিভারি', 'all active records': 'সক্রিয় সব রেকর্ড', 'successfully delivered': 'সফলভাবে পৌঁছানো', 'awaiting dispatch': 'ডিসপ্যাচের অপেক্ষায়', 'needs attention': 'মনোযোগ প্রয়োজন', Performance: 'কার্যকারিতা', 'Route efficiency': 'রুটের দক্ষতা', 'Average distance': 'গড় দূরত্ব', 'Average ETA': 'গড় পৌঁছানোর সময়', 'On-time delivery': 'সময়মতো ডেলিভারি', 'Dispatch health': 'ডিসপ্যাচের অবস্থা', 'Driver availability': 'চালকের প্রাপ্যতা', Busy: 'ব্যস্ত', Offline: 'অফলাইন', 'Order intake': 'অর্ডার গ্রহণ', 'Add delivery': 'ডেলিভারি যোগ করুন', 'Customer name': 'গ্রাহকের নাম', 'Delivery address': 'ডেলিভারির ঠিকানা', Priority: 'অগ্রাধিকার', Normal: 'সাধারণ', 'High Priority': 'উচ্চ অগ্রাধিকার', Urgent: 'জরুরি', Express: 'দ্রুত', 'Time window': 'ডেলিভারির সময়সীমা', 'Add order': 'অর্ডার যোগ করুন', 'Saving order...': 'অর্ডার সংরক্ষণ হচ্ছে...', 'Order added to dispatch queue.': 'অর্ডার ডিসপ্যাচ তালিকায় যোগ হয়েছে।', 'Could not create order.': 'অর্ডার তৈরি করা যায়নি।', 'Driver management': 'চালক ব্যবস্থাপনা', 'Add driver': 'চালক যোগ করুন', Name: 'নাম', Phone: 'ফোন', 'Vehicle type': 'যানবাহনের ধরন', 'Assign driver': 'চালক বরাদ্দ করুন', 'No drivers yet': 'এখনো কোনো চালক নেই', Orders: 'অর্ডার', Drivers: 'চালক', History: 'ইতিহাস', Status: 'অবস্থা', Actions: 'কাজ', 'Route history': 'রুটের ইতিহাস', 'No route history yet.': 'এখনো কোনো রুটের ইতিহাস নেই।',
  'Sign in': 'সাইন ইন', 'Create account': 'অ্যাকাউন্ট তৈরি করুন', 'Create your account': 'আপনার অ্যাকাউন্ট তৈরি করুন', 'Welcome back': 'আবার স্বাগতম', 'Email address': 'ইমেইল ঠিকানা', Password: 'পাসওয়ার্ড', 'Full name': 'পূর্ণ নাম', 'Your name': 'আপনার নাম', 'you@example.com': 'you@example.com', 'At least 8 characters': 'কমপক্ষে ৮ অক্ষর', 'Sign in to open your delivery workspace.': 'ডেলিভারি কর্মক্ষেত্র খুলতে সাইন ইন করুন।', 'Save your delivery workspace and start planning.': 'আপনার ডেলিভারি কর্মক্ষেত্র সংরক্ষণ করে পরিকল্পনা শুরু করুন।', 'New to SmartRoute?': 'SmartRoute-এ নতুন?', 'Already have an account?': 'ইতিমধ্যে অ্যাকাউন্ট আছে?', 'Create an account': 'অ্যাকাউন্ট তৈরি করুন', 'Move with': 'নিশ্চিন্তে', 'confidence.': 'এগিয়ে চলুন।', 'Plan better delivery days with a clear view of distance, weather, and road risk.': 'দূরত্ব, আবহাওয়া ও সড়কঝুঁকি বুঝে প্রতিদিনের ডেলিভারি আরও ভালোভাবে পরিকল্পনা করুন।',
  'Rider account': 'রাইডার অ্যাকাউন্ট', 'Keep your identity, license, and vehicle details current for safer dispatch.': 'নিরাপদ ডিসপ্যাচের জন্য পরিচয়, লাইসেন্স ও যানবাহনের তথ্য হালনাগাদ রাখুন।', Incomplete: 'অসম্পূর্ণ', 'Pending review': 'পর্যালোচনাধীন', 'Action required': 'পদক্ষেপ প্রয়োজন', 'Personal information': 'ব্যক্তিগত তথ্য', Identity: 'পরিচয়', 'Profile photo': 'প্রোফাইল ছবি', 'Clear, recent photo. JPG, PNG, or WEBP, up to 8 MB.': 'পরিষ্কার সাম্প্রতিক ছবি দিন। JPG, PNG বা WEBP, সর্বোচ্চ ৮ MB।', 'Upload photo': 'ছবি আপলোড', 'Replace photo': 'ছবি বদলান', 'Full legal name': 'আইনগত পূর্ণ নাম', Required: 'আবশ্যক', 'Date of birth': 'জন্মতারিখ', 'NID number': 'জাতীয় পরিচয়পত্র নম্বর', 'Blood group': 'রক্তের গ্রুপ', Select: 'নির্বাচন করুন', 'Contact & safety': 'যোগাযোগ ও নিরাপত্তা', 'Contact information': 'যোগাযোগের তথ্য', 'Phone number': 'ফোন নম্বর', 'Home address': 'বাসার ঠিকানা', 'Emergency contact name': 'জরুরি যোগাযোগের নাম', 'Emergency contact phone': 'জরুরি যোগাযোগের ফোন', 'On the road': 'সড়কে', 'Vehicle information': 'যানবাহনের তথ্য', 'Make and model': 'কোম্পানি ও মডেল', 'e.g. Honda CB 150R': 'যেমন: Honda CB 150R', 'Registration number': 'নিবন্ধন নম্বর', 'Required verification': 'যাচাইয়ের জন্য আবশ্যক', 'Identity documents': 'পরিচয়পত্র', 'Documents are private to your account. Accepted: PDF, JPG, or PNG, up to 8 MB each.': 'নথিগুলো আপনার অ্যাকাউন্টে সুরক্ষিত। PDF, JPG বা PNG, প্রতিটি সর্বোচ্চ ৮ MB।', 'NID Card': 'জাতীয় পরিচয়পত্র', 'Driving License': 'ড্রাইভিং লাইসেন্স', 'Driving license number': 'ড্রাইভিং লাইসেন্স নম্বর', 'License expiry date': 'লাইসেন্সের মেয়াদ শেষ', 'Save profile details': 'প্রোফাইল সংরক্ষণ করুন', 'Saving profile...': 'প্রোফাইল সংরক্ষণ হচ্ছে...', 'Profile details saved securely.': 'প্রোফাইলের তথ্য নিরাপদে সংরক্ষিত হয়েছে।', 'Could not save rider profile.': 'রাইডার প্রোফাইল সংরক্ষণ করা যায়নি।', 'Could not load rider profile.': 'রাইডার প্রোফাইল লোড করা যায়নি।', 'Loading rider profile...': 'রাইডার প্রোফাইল লোড হচ্ছে...', 'Profile readiness': 'প্রোফাইল প্রস্তুতি', 'complete': 'সম্পূর্ণ', 'Verification checklist': 'যাচাইয়ের তালিকা', 'Review status': 'পর্যালোচনার অবস্থা', 'Required details added': 'প্রয়োজনীয় তথ্য যোগ হয়েছে', 'of': 'এর মধ্যে', 'Required': 'আবশ্যক', 'Manual review required': 'ম্যানুয়াল পর্যালোচনা আবশ্যক', 'Uploads are not automatically verified. A reviewer must confirm document authenticity before rider approval.': 'আপলোড করা নথি স্বয়ংক্রিয়ভাবে যাচাই হয় না। রাইডার অনুমোদনের আগে পর্যালোচককে নথির সত্যতা নিশ্চিত করতে হবে।', 'Private by design': 'গোপনীয়তা সুরক্ষিত', 'Your rider documents require your signed-in session and are not exposed as public links. Avoid uploading documents on a shared device.': 'রাইডারের নথি দেখতে সাইন-ইন প্রয়োজন; এগুলো কোনো পাবলিক লিংকে নেই। শেয়ার করা ডিভাইসে নথি আপলোড এড়িয়ে চলুন।', 'Authenticated access enabled': 'সাইন-ইন সুরক্ষা চালু', 'Profile details saved securely.': 'প্রোফাইলের তথ্য নিরাপদে সংরক্ষিত হয়েছে।', 'Verification is pending manual review.': 'ম্যানুয়াল পর্যালোচনার অপেক্ষায়।', 'Replace': 'বদলান', 'Upload': 'আপলোড', Download: 'ডাউনলোড', 'Could not download document.': 'নথি ডাউনলোড করা যায়নি。', 'Could not upload document.': 'নথি আপলোড করা যায়নি।', 'Uploading...': 'আপলোড হচ্ছে...', 'Could not load rider profile.': 'রাইডার প্রোফাইল লোড করা যায়নি।',
}

const bnExtra = {
  'Dark mode': 'ডার্ক মোড',
  'Light mode': 'লাইট মোড',
  English: 'English',
  Bangla: 'বাংলা',
  'Personal details': 'ব্যক্তিগত তথ্য',
  'Required details added': 'প্রয়োজনীয় তথ্য যোগ হয়েছে',
  'authenticated access enabled': 'সাইন-ইন সুরক্ষা চালু',
  'Use dark theme': 'ডার্ক মোড চালু করুন',
  'Use light theme': 'লাইট মোড চালু করুন',
  'SYSTEM CONTROL /': 'সিস্টেম নিয়ন্ত্রণ /',
  OVERVIEW: 'সারসংক্ষেপ',
  REVIEWS: 'যাচাই',
  RIDERS: 'রাইডার',
  DRIVERS: 'চালক',
  ACTIVITY: 'কার্যক্রম',
  ACCOUNT: 'অ্যাকাউন্ট',
  'ADMIN CONSOLE': 'অ্যাডমিন কনসোল',
  Administrator: 'অ্যাডমিন',
  'RIDER #': 'রাইডার #',
  'DRIVER PROFILE · #': 'চালক প্রোফাইল · #',
  'Driver #': 'চালক #',
  'Rider account:': 'রাইডার অ্যাকাউন্ট:',
  'SYSTEM CONTROL': 'সিস্টেম নিয়ন্ত্রণ',
  'ADMIN CONSOLE': 'অ্যাডমিন কনসোল',
  'WORKSPACE': 'কর্মক্ষেত্র',
  Overview: 'সারসংক্ষেপ',
  'Verification queue': 'যাচাইয়ের তালিকা',
  Riders: 'রাইডার',
  Drivers: 'চালক',
  'Activity log': 'কার্যক্রমের লগ',
  'System connected': 'সিস্টেম সংযুক্ত',
  'SYSTEM CONTROL / OVERVIEW': 'সিস্টেম নিয়ন্ত্রণ / সারসংক্ষেপ',
  'System overview': 'সিস্টেমের সারসংক্ষেপ',
  'Verification review': 'যাচাই পর্যালোচনা',
  'Rider management': 'রাইডার ব্যবস্থাপনা',
  'Driver management': 'চালক ব্যবস্থাপনা',
  'Good to see you': 'স্বাগতম',
  'Live operational snapshot across SmartRoute BD.': 'SmartRoute BD-এর কার্যক্রমের সরাসরি চিত্র।',
  'pending reviews': 'পর্যালোচনা বাকি',
  'Registered riders': 'নিবন্ধিত রাইডার',
  'Rider accounts': 'রাইডার অ্যাকাউন্ট',
  'Across all workspaces': 'সব কর্মক্ষেত্র মিলিয়ে',
  Deliveries: 'ডেলিভারি',
  'completed': 'সম্পন্ন',
  'Planned routes': 'পরিকল্পিত রুট',
  'Recorded route activity': 'নথিভুক্ত রুট কার্যক্রম',
  OPERATIONS: 'কার্যক্রম',
  'Route activity': 'রুটের কার্যক্রম',
  'Last 7 days': 'গত ৭ দিন',
  'No recent routes': 'সাম্প্রতিক রুট নেই',
  'Route planning activity will appear here.': 'রুট পরিকল্পনার কার্যক্রম এখানে দেখা যাবে।',
  'IDENTITY CHECKS': 'পরিচয় যাচাই',
  'Verification status': 'যাচাইয়ের অবস্থা',
  'Review queue': 'পর্যালোচনার তালিকা',
  'Pending review': 'পর্যালোচনাধীন',
  Verified: 'যাচাইকৃত',
  'Action required': 'পদক্ষেপ প্রয়োজন',
  Incomplete: 'অসম্পূর্ণ',
  'AUDIT TRAIL': 'অডিট রেকর্ড',
  'Recent administrator activity': 'অ্যাডমিনের সাম্প্রতিক কার্যক্রম',
  'View activity': 'কার্যক্রম দেখুন',
  'View activity →': 'কার্যক্রম দেখুন →',
  'Review queue →': 'পর্যালোচনা তালিকা →',
  'No administrative actions recorded yet.': 'এখনো কোনো অ্যাডমিন কার্যক্রম নথিভুক্ত হয়নি।',
  'Verification requests': 'যাচাইয়ের অনুরোধ',
  'Review submitted NID and driving-license documents.': 'জমা দেওয়া জাতীয় পরিচয়পত্র ও ড্রাইভিং লাইসেন্স যাচাই করুন।',
  'All statuses': 'সব অবস্থা',
  'All account states': 'সব অ্যাকাউন্ট অবস্থা',
  'Search riders': 'রাইডার খুঁজুন',
  requests: 'অনুরোধ',
  'Select a rider': 'রাইডার নির্বাচন করুন',
  'Choose a rider to inspect submitted documents.': 'জমা দেওয়া নথি দেখতে একজন রাইডার নির্বাচন করুন।',
  'Rider accounts': 'রাইডার অ্যাকাউন্ট',
  'Search riders, inspect their profiles, and manage access.': 'রাইডার খুঁজুন, প্রোফাইল দেখুন এবং অ্যাকাউন্ট পরিচালনা করুন।',
  Active: 'সক্রিয়',
  Deactivated: 'নিষ্ক্রিয়',
  Suspended: 'স্থগিত',
  'Search name, email, phone, registration': 'নাম, ইমেইল, ফোন বা নিবন্ধন খুঁজুন',
  'Sort by': 'সাজানোর ধরন',
  '↓ Descending': '↓ নিম্নক্রম',
  '↑ Ascending': '↑ ঊর্ধ্বক্রম',
  Newest: 'নতুন আগে',
  Name: 'নাম',
  Verification: 'যাচাই',
  'Account status': 'অ্যাকাউন্টের অবস্থা',
  'Ascending': 'ঊর্ধ্বক্রম',
  'Descending': 'নিম্নক্রম',
  'View profile': 'প্রোফাইল দেখুন',
  'Driver accounts': 'চালক অ্যাকাউন্ট',
  'DRIVER PROFILE': 'চালক প্রোফাইল',
  'Recent deliveries': 'সাম্প্রতিক ডেলিভারি',
  'Registration/owner': 'নিবন্ধন / মালিক',
  Close: 'বন্ধ করুন',
  Account: 'অ্যাকাউন্ট',
  'Review vehicle assignments and control account availability.': 'যানবাহনের তথ্য দেখুন এবং অ্যাকাউন্টের প্রাপ্যতা নিয়ন্ত্রণ করুন।',
  'Search drivers': 'চালক খুঁজুন',
  Driver: 'চালক',
  'Workspace owner': 'কর্মক্ষেত্রের মালিক',
  'Dispatch status': 'ডিসপ্যাচের অবস্থা',
  Action: 'কাজ',
  Deactivate: 'নিষ্ক্রিয় করুন',
  Suspend: 'স্থগিত করুন',
  'System activity': 'সিস্টেম কার্যক্রম',
  'Administrative actions, route planning, and order activity.': 'অ্যাডমিন কাজ, রুট পরিকল্পনা ও অর্ডারের কার্যক্রম।',
  events: 'ঘটনা',
  'RIDER': 'রাইডার',
  Phone: 'ফোন',
  Vehicle: 'যানবাহন',
  Registration: 'নিবন্ধন',
  'License expiry': 'লাইসেন্সের মেয়াদ',
  'NID Card': 'জাতীয় পরিচয়পত্র',
  'Driving License': 'ড্রাইভিং লাইসেন্স',
  'Document not submitted': 'নথি জমা হয়নি',
  'This rider has not uploaded this document.': 'রাইডার এই নথিটি আপলোড করেননি।',
  'Decision note': 'সিদ্ধান্তের নোট',
  'Required when rejecting or requesting a resubmission': 'প্রত্যাখ্যান বা পুনরায় জমার অনুরোধে কারণ লিখুন',
  Approve: 'অনুমোদন',
  'Request resubmission': 'পুনরায় জমার অনুরোধ',
  'Resubmission required': 'পুনরায় জমা প্রয়োজন',
  'Route planned': 'রুট পরিকল্পিত',
  'admin.login': 'অ্যাডমিন সাইন ইন',
  'admin.logout': 'অ্যাডমিন সাইন আউট',
  Reject: 'প্রত্যাখ্যান',
  'Rider account': 'রাইডার অ্যাকাউন্ট',
  'Sign out': 'সাইন আউট',
  'Administrator username or password is incorrect.': 'অ্যাডমিন ইউজারনেম বা পাসওয়ার্ড ভুল।',
  'Sign-in is temporarily locked. Try again later.': 'সাইন-ইন সাময়িকভাবে বন্ধ। পরে আবার চেষ্টা করুন।',
  'A reason is required for this decision.': 'এই সিদ্ধান্তের জন্য কারণ আবশ্যক।',
  'Document marked approved.': 'নথি অনুমোদিত হয়েছে।',
  'Document marked rejected.': 'নথি প্রত্যাখ্যাত হয়েছে।',
  'Document marked resubmission required.': 'নথি পুনরায় জমা দিতে হবে।',
  Wed: 'বুধ',
  Mon: 'সোম',
  Tue: 'মঙ্গল',
  Thu: 'বৃহস্পতি',
  Fri: 'শুক্র',
  Sat: 'শনি',
  Sun: 'রবি',
  Clear: 'পরিষ্কার',
  Rain: 'বৃষ্টি',
  Fog: 'কুয়াশা',
  Storm: 'ঝড়',
  Motorcycle: 'মোটরসাইকেল',
  Car: 'গাড়ি',
  Van: 'ভ্যান',
  Truck: 'ট্রাক',
  'Add to queue': 'সারিতে যোগ করুন',
  'Driver roster': 'চালক তালিকা',
  'Orders and delivery status': 'অর্ডার ও ডেলিভারির অবস্থা',
  'Dispatch queue': 'ডিসপ্যাচ তালিকা',
  'Recent planning runs': 'সাম্প্রতিক রুট পরিকল্পনা',
  'No deliveries yet. Create one above to start dispatching.': 'এখনো কোনো ডেলিভারি নেই। ডিসপ্যাচ শুরু করতে উপরে একটি যোগ করুন।',
  'Your completed route plans will appear here.': 'আপনার সম্পন্ন রুট পরিকল্পনা এখানে দেখা যাবে।',
  'Assign available driver': 'উপলভ্য চালক বরাদ্দ করুন',
  'In Transit': 'পথে',
  Assigned: 'বরাদ্দ করা হয়েছে',
  Delayed: 'বিলম্বিত',
  Cancelled: 'বাতিল',
  km: 'কিমি',
  min: 'মিনিট',
  'Time window e.g. 10:00–12:00': 'ডেলিভারির সময়সীমা যেমন ১০:০০–১২:০০',
  'Driver name': 'চালকের নাম',
  'Assign driver for': 'চালক বরাদ্দ করুন',
  'Update status for': 'অবস্থা হালনাগাদ করুন',
  'NID card': 'জাতীয় পরিচয়পত্র',
  'Driving license': 'ড্রাইভিং লাইসেন্স',
  'Required · PDF, JPG, PNG': 'আবশ্যক · PDF, JPG, PNG',
  'Complete the required details and add all three documents to submit your profile for review.': 'পর্যালোচনার জন্য প্রয়োজনীয় তথ্য পূরণ করে তিনটি নথিই যোগ করুন।',
  'Account security': 'অ্যাকাউন্টের নিরাপত্তা',
  'Display preferences': 'প্রদর্শনের পছন্দ',
  Language: 'ভাষা',
  'Files must be smaller than 8 MB.': 'ফাইলের আকার ৮ MB-এর কম হতে হবে।',
  'Use PDF, JPG, or PNG for documents and JPG, PNG, or WEBP for a profile photo.': 'নথির জন্য PDF, JPG বা PNG এবং ছবির জন্য JPG, PNG বা WEBP ব্যবহার করুন।',
  'The file content does not match its extension.': 'ফাইলের বিষয়বস্তু ও এক্সটেনশন মিলছে না।',
}

export function translateText(value, language) {
  if (language !== 'bn' || typeof value !== 'string') return value
  const leading = value.match(/^\s*/)?.[0] || ''
  const trailing = value.match(/\s*$/)?.[0] || ''
  const key = value.slice(leading.length, value.length - trailing.length || undefined)
  const count = key.match(/^(\d+) of (\d+) required$/)
  if (count) return `${leading}${count[1]} / ${count[2]}টি আবশ্যক${trailing}`
  const routeSummary = key.match(/^(\d+(?:\.\d+)?) km route with (\d+) high-risk segments$/)
  if (routeSummary) return `${leading}${routeSummary[1]} কিমি রুটে ${routeSummary[2]}টি উচ্চ ঝুঁকির সড়কাংশ${trailing}`
  const lowRisk = key.match(/^(\d+) low-risk segments help keep the route stable$/)
  if (lowRisk) return `${leading}${lowRisk[1]}টি কম ঝুঁকির সড়কাংশ রুটকে স্থিতিশীল রাখতে সাহায্য করে${trailing}`
  const arrival = key.match(/^Estimated arrival time: (\d+) minutes$/)
  if (arrival) return `${leading}আনুমানিক পৌঁছানোর সময়: ${arrival[1]} মিনিট${trailing}`
  const routeCost = key.match(/^Overall route cost: (.+)$/)
  if (routeCost) return `${leading}রুটের মোট খরচ: ${routeCost[1]}${trailing}`
  const completedCount = key.match(/^(\d+) completed$/)
  if (completedCount) return `${leading}${completedCount[1]}টি সম্পন্ন${trailing}`
  const driverId = key.match(/^Driver #(\d+)$/)
  if (driverId) return `${leading}চালক #${driverId[1]}${trailing}`
  const uploadComplete = key.match(/^(NID card|Driving license|Profile photo) uploaded\. Verification is pending manual review\.$/)
  if (uploadComplete) return `${leading}${bn[uploadComplete[1]]} আপলোড হয়েছে। ম্যানুয়াল যাচাইয়ের অপেক্ষায়।${trailing}`
  if (/^\d+(?:\.\d+)? km$/.test(key)) return `${leading}${key.replace(' km', ' কিমি')}${trailing}`
  if (/^\d+ minutes?$/.test(key)) return `${leading}${key.replace(/ minutes?$/, ' মিনিট')}${trailing}`
  if (/^\d+ min$/.test(key)) return `${leading}${key.replace(' min', ' মিনিট')}${trailing}`
  if (/^\d+(?:\.\d+)? km remaining$/.test(key)) return `${leading}${key.replace(' km remaining', ' কিমি বাকি')}${trailing}`
  return `${leading}${bn[key] || bnExtra[key] || key}${trailing}`
}

function translateChildren(children, language, components) {
  return Children.map(children, (child) => {
    if (typeof child === 'string') return translateText(child, language)
    if (!isValidElement(child)) return child
    // Only components explicitly listed by their parent may be called here; they must be hook-free renderers.
    if (typeof child.type === 'function' && components.includes(child.type)) {
      return translateChildren(child.type(child.props), language, components)
    }
    if (child.type !== Fragment && typeof child.type !== 'string') return child
    const props = {}
    for (const attribute of ['aria-label', 'title', 'placeholder', 'alt']) {
      if (typeof child.props[attribute] === 'string') props[attribute] = translateText(child.props[attribute], language)
    }
    if (child.props.children !== undefined) props.children = translateChildren(child.props.children, language, components)
    return cloneElement(child, props)
  })
}

export function TranslationBoundary({ language, children, components = [] }) {
  return translateChildren(children, language, components)
}
