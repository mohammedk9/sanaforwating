-- ============================================================================
--  SANA — أسئلة اللعبة (59 سؤالاً · كل سؤال بأربعة خيارات)
--  ملف مُولَّد آلياً من src/data/questions.json — لا تعدّله يدوياً.
--  لإعادة التوليد:  node scripts/build-questions-sql.mjs
--
--  التشغيل: الصق كامل هذا الملف في Supabase ← SQL Editor ← Run
--  آمن للتكرار: لا يضيف سؤالاً موجوداً (مقارنة بالنص داخل نفس المحل).
-- ============================================================================

do $$
declare
  v_venue uuid;
begin
  select id into v_venue from public.venues where code = 'SANA-01';

  if v_venue is null then
    insert into public.venues (code, name)
    values ('SANA-01', 'مقهى سنا · فرع التجربة')
    returning id into v_venue;
  end if;

  -- 1. ما اسم الجليد الذي ينصهر ولا يتبخر؟
  insert into public.questions (venue_id, prompt, choices, correct_index, explanation, mode, category, difficulty)
  select v_venue, 'ما اسم الجليد الذي ينصهر ولا يتبخر؟', array['الجليد الجاف', 'النشادر', 'ملح الطعام', 'الجبس'], 0, 'الجليد الجاف هو ثاني أكسيد الكربون المتجمد ويتسامى مباشرة.', 'solo', 'علوم', 'easy'
  where not exists (
    select 1 from public.questions q where q.venue_id = v_venue and q.prompt = 'ما اسم الجليد الذي ينصهر ولا يتبخر؟'
  );

  -- 2. ما هو الكائن الوحيد الذي ينام على ظهره؟
  insert into public.questions (venue_id, prompt, choices, correct_index, explanation, mode, category, difficulty)
  select v_venue, 'ما هو الكائن الوحيد الذي ينام على ظهره؟', array['القط', 'الإنسان', 'الحصان', 'الدلفين'], 1, 'الإنسان هو الكائن الذي ينام مستلقياً على ظهره.', 'solo', 'أحياء', 'easy'
  where not exists (
    select 1 from public.questions q where q.venue_id = v_venue and q.prompt = 'ما هو الكائن الوحيد الذي ينام على ظهره؟'
  );

  -- 3. يوجد نوع من الكائنات البحرية يمكن أن يبتلع الإنسان، فمن هو؟
  insert into public.questions (venue_id, prompt, choices, correct_index, explanation, mode, category, difficulty)
  select v_venue, 'يوجد نوع من الكائنات البحرية يمكن أن يبتلع الإنسان، فمن هو؟', array['القرش الحوت', 'السمك الصدفي', 'الأخطبوط العملاق', 'الحوت الأزرق'], 1, 'السمك الصدفي من أضخم أسماك الشعاب ويستطيع ابتلاع إنسان.', 'solo', 'أحياء', 'medium'
  where not exists (
    select 1 from public.questions q where q.venue_id = v_venue and q.prompt = 'يوجد نوع من الكائنات البحرية يمكن أن يبتلع الإنسان، فمن هو؟'
  );

  -- 4. ما الكائن الوحيد الذي يستطيع إخراج معدته من جسمه دون أن يموت؟
  insert into public.questions (venue_id, prompt, choices, correct_index, explanation, mode, category, difficulty)
  select v_venue, 'ما الكائن الوحيد الذي يستطيع إخراج معدته من جسمه دون أن يموت؟', array['الأخطبوط', 'قنديل البحر', 'نجم البحر', 'السلحفاة'], 2, 'نجم البحر يخرج معدته ليهضم الطعام خارج جسمه.', 'solo', 'أحياء', 'medium'
  where not exists (
    select 1 from public.questions q where q.venue_id = v_venue and q.prompt = 'ما الكائن الوحيد الذي يستطيع إخراج معدته من جسمه دون أن يموت؟'
  );

  -- 5. كم يبلغ عدد العظام في جسم الإنسان البالغ؟
  insert into public.questions (venue_id, prompt, choices, correct_index, explanation, mode, category, difficulty)
  select v_venue, 'كم يبلغ عدد العظام في جسم الإنسان البالغ؟', array['186 عظمة', '246 عظمة', '206 عظمة', '306 عظمة'], 2, 'يبلغ عدد عظام الإنسان البالغ 206 عظمة.', 'solo', 'أحياء', 'easy'
  where not exists (
    select 1 from public.questions q where q.venue_id = v_venue and q.prompt = 'كم يبلغ عدد العظام في جسم الإنسان البالغ؟'
  );

  -- 6. من أول عالم وضع مقياساً للذكاء؟
  insert into public.questions (venue_id, prompt, choices, correct_index, explanation, mode, category, difficulty)
  select v_venue, 'من أول عالم وضع مقياساً للذكاء؟', array['ألفريد بينيه', 'سيجموند فرويد', 'البرت باتن', 'إسحاق نيوتن'], 2, 'حسب المصدر المعتمد في بنك أسئلتنا: البرت باتن.', 'solo', 'علوم', 'hard'
  where not exists (
    select 1 from public.questions q where q.venue_id = v_venue and q.prompt = 'من أول عالم وضع مقياساً للذكاء؟'
  );

  -- 7. من أول من أنشأ مستشفى للأمراض النفسية؟
  insert into public.questions (venue_id, prompt, choices, correct_index, explanation, mode, category, difficulty)
  select v_venue, 'من أول من أنشأ مستشفى للأمراض النفسية؟', array['هارون الرشيد', 'مروان بن عبد الملك', 'الوليد بن عبد الملك', 'المنصور'], 1, 'حسب المصدر المعتمد: مروان بن عبد الملك.', 'solo', 'تاريخ', 'hard'
  where not exists (
    select 1 from public.questions q where q.venue_id = v_venue and q.prompt = 'من أول من أنشأ مستشفى للأمراض النفسية؟'
  );

  -- 8. من أول من فرض التجنيد الإجباري؟
  insert into public.questions (venue_id, prompt, choices, correct_index, explanation, mode, category, difficulty)
  select v_venue, 'من أول من فرض التجنيد الإجباري؟', array['عمر بن الخطاب', 'معاوية بن أبي سفيان', 'خالد بن الوليد', 'الحجاج بن يوسف الثقفي'], 3, 'الحجاج بن يوسف الثقفي أول من فرض التجنيد الإجباري.', 'solo', 'تاريخ', 'medium'
  where not exists (
    select 1 from public.questions q where q.venue_id = v_venue and q.prompt = 'من أول من فرض التجنيد الإجباري؟'
  );

  -- 9. نحن أربعة إخوة ولنا رأس واحد، فمن نكون؟
  insert into public.questions (venue_id, prompt, choices, correct_index, explanation, mode, category, difficulty)
  select v_venue, 'نحن أربعة إخوة ولنا رأس واحد، فمن نكون؟', array['الكرسي', 'الطاولة', 'الدولاب', 'السرير'], 1, 'الطاولة: أربع أرجل ورأس واحد.', 'team', 'ألغاز', 'easy'
  where not exists (
    select 1 from public.questions q where q.venue_id = v_venue and q.prompt = 'نحن أربعة إخوة ولنا رأس واحد، فمن نكون؟'
  );

  -- 10. ما الشيء الذي إذا لمسته صاح؟
  insert into public.questions (venue_id, prompt, choices, correct_index, explanation, mode, category, difficulty)
  select v_venue, 'ما الشيء الذي إذا لمسته صاح؟', array['الطبل', 'الجرس', 'المزمار', 'الناي'], 1, 'الجرس يصدر صوتاً عند لمسه.', 'team', 'ألغاز', 'easy'
  where not exists (
    select 1 from public.questions q where q.venue_id = v_venue and q.prompt = 'ما الشيء الذي إذا لمسته صاح؟'
  );

  -- 11. كلها ثقوب ولكنها تحفظ الماء، فما هي؟
  insert into public.questions (venue_id, prompt, choices, correct_index, explanation, mode, category, difficulty)
  select v_venue, 'كلها ثقوب ولكنها تحفظ الماء، فما هي؟', array['الغربال', 'الإسفنجة', 'الشبكة', 'القماش'], 1, 'الإسفنجة مليئة بالثقوب وتحفظ الماء.', 'team', 'ألغاز', 'easy'
  where not exists (
    select 1 from public.questions q where q.venue_id = v_venue and q.prompt = 'كلها ثقوب ولكنها تحفظ الماء، فما هي؟'
  );

  -- 12. ترى كل شيء وليس لها عيون، فما هي؟
  insert into public.questions (venue_id, prompt, choices, correct_index, explanation, mode, category, difficulty)
  select v_venue, 'ترى كل شيء وليس لها عيون، فما هي؟', array['المرآة', 'الزجاج', 'الماء', 'الظل'], 0, 'المرآة تعكس كل شيء أمامها.', 'team', 'ألغاز', 'easy'
  where not exists (
    select 1 from public.questions q where q.venue_id = v_venue and q.prompt = 'ترى كل شيء وليس لها عيون، فما هي؟'
  );

  -- 13. من هو الخال الوحيد لأولاد عمتك؟
  insert into public.questions (venue_id, prompt, choices, correct_index, explanation, mode, category, difficulty)
  select v_venue, 'من هو الخال الوحيد لأولاد عمتك؟', array['عمك', 'أبوك', 'خالك', 'جدك'], 1, 'أبوك هو الخال الوحيد لأولاد عمتك.', 'team', 'ألغاز', 'medium'
  where not exists (
    select 1 from public.questions q where q.venue_id = v_venue and q.prompt = 'من هو الخال الوحيد لأولاد عمتك؟'
  );

  -- 14. ما الشيء الذي يقرصك ولا تراه؟
  insert into public.questions (venue_id, prompt, choices, correct_index, explanation, mode, category, difficulty)
  select v_venue, 'ما الشيء الذي يقرصك ولا تراه؟', array['النمل', 'البرد', 'الجوع', 'الحرارة'], 2, 'الجوع يقرص ولا يُرى.', 'team', 'ألغاز', 'easy'
  where not exists (
    select 1 from public.questions q where q.venue_id = v_venue and q.prompt = 'ما الشيء الذي يقرصك ولا تراه؟'
  );

  -- 15. ماذا كان العرب يسمون الذهب قديماً؟
  insert into public.questions (venue_id, prompt, choices, correct_index, explanation, mode, category, difficulty)
  select v_venue, 'ماذا كان العرب يسمون الذهب قديماً؟', array['المعدن الأصفر', 'أصفر الرنان', 'الذهب الأحمر', 'التبر'], 1, 'كانوا يسمونه أصفر الرنان.', 'solo', 'تراث', 'hard'
  where not exists (
    select 1 from public.questions q where q.venue_id = v_venue and q.prompt = 'ماذا كان العرب يسمون الذهب قديماً؟'
  );

  -- 16. كم عدد الخلايا في جسم الإنسان؟
  insert into public.questions (venue_id, prompt, choices, correct_index, explanation, mode, category, difficulty)
  select v_venue, 'كم عدد الخلايا في جسم الإنسان؟', array['10 ملايين خلية', '32 بليون خلية', '100 بليون خلية', '37 تريليون خلية'], 1, 'حسب المصدر المعتمد في بنك أسئلتنا: 32 بليون خلية.', 'solo', 'أحياء', 'hard'
  where not exists (
    select 1 from public.questions q where q.venue_id = v_venue and q.prompt = 'كم عدد الخلايا في جسم الإنسان؟'
  );

  -- 17. كم مرة تهز الذبابة جناحيها في الثانية؟
  insert into public.questions (venue_id, prompt, choices, correct_index, explanation, mode, category, difficulty)
  select v_venue, 'كم مرة تهز الذبابة جناحيها في الثانية؟', array['100 مرة', '320 مرة', '500 مرة', '80 مرة'], 1, 'تهز الذبابة جناحيها نحو 320 مرة في الثانية.', 'solo', 'أحياء', 'medium'
  where not exists (
    select 1 from public.questions q where q.venue_id = v_venue and q.prompt = 'كم مرة تهز الذبابة جناحيها في الثانية؟'
  );

  -- 18. من الصحابي الذي لُقّب بأمين هذه الأمة؟
  insert into public.questions (venue_id, prompt, choices, correct_index, explanation, mode, category, difficulty)
  select v_venue, 'من الصحابي الذي لُقّب بأمين هذه الأمة؟', array['أبو هريرة', 'معاذ بن جبل', 'أبو عبيدة عامر بن الجراح', 'سلمان الفارسي'], 2, 'أبو عبيدة عامر بن الجراح رضي الله عنه.', 'team', 'إسلاميات', 'medium'
  where not exists (
    select 1 from public.questions q where q.venue_id = v_venue and q.prompt = 'من الصحابي الذي لُقّب بأمين هذه الأمة؟'
  );

  -- 19. من هو حواري رسول الله صلى الله عليه وسلم؟
  insert into public.questions (venue_id, prompt, choices, correct_index, explanation, mode, category, difficulty)
  select v_venue, 'من هو حواري رسول الله صلى الله عليه وسلم؟', array['علي بن أبي طالب', 'الزبير بن العوام', 'طلحة بن عبيد الله', 'سعد بن أبي وقاص'], 1, 'الزبير بن العوام رضي الله عنه.', 'team', 'إسلاميات', 'medium'
  where not exists (
    select 1 from public.questions q where q.venue_id = v_venue and q.prompt = 'من هو حواري رسول الله صلى الله عليه وسلم؟'
  );

  -- 20. من هي أحب الناس إلى رسول الله صلى الله عليه وسلم؟
  insert into public.questions (venue_id, prompt, choices, correct_index, explanation, mode, category, difficulty)
  select v_venue, 'من هي أحب الناس إلى رسول الله صلى الله عليه وسلم؟', array['خديجة بنت خويلد', 'فاطمة الزهراء', 'حفصة بنت عمر', 'عائشة بنت أبي بكر'], 3, 'أم المؤمنين عائشة بنت أبي بكر رضي الله عنها.', 'team', 'إسلاميات', 'medium'
  where not exists (
    select 1 from public.questions q where q.venue_id = v_venue and q.prompt = 'من هي أحب الناس إلى رسول الله صلى الله عليه وسلم؟'
  );

  -- 21. له عين ولا يرى، فما هو؟
  insert into public.questions (venue_id, prompt, choices, correct_index, explanation, mode, category, difficulty)
  select v_venue, 'له عين ولا يرى، فما هو؟', array['المقص', 'الإبرة', 'السكين', 'الجرس'], 1, 'الإبرة لها عين ولا ترى.', 'team', 'ألغاز', 'easy'
  where not exists (
    select 1 from public.questions q where q.venue_id = v_venue and q.prompt = 'له عين ولا يرى، فما هو؟'
  );

  -- 22. طائر يلد ولا يبيض، فما هو؟
  insert into public.questions (venue_id, prompt, choices, correct_index, explanation, mode, category, difficulty)
  select v_venue, 'طائر يلد ولا يبيض، فما هو؟', array['القطرس', 'الطاووس', 'الخفاش', 'الحمام'], 2, 'الخفاش من الثدييات، يلد ولا يبيض.', 'team', 'أحياء', 'easy'
  where not exists (
    select 1 from public.questions q where q.venue_id = v_venue and q.prompt = 'طائر يلد ولا يبيض، فما هو؟'
  );

  -- 23. لحمه من الخارج وشعره من الداخل، فما هو؟
  insert into public.questions (venue_id, prompt, choices, correct_index, explanation, mode, category, difficulty)
  select v_venue, 'لحمه من الخارج وشعره من الداخل، فما هو؟', array['الأنف', 'الأذن', 'اللسان', 'الجفن'], 0, 'الأنف: لحمه ظاهر وشعره داخله.', 'team', 'ألغاز', 'medium'
  where not exists (
    select 1 from public.questions q where q.venue_id = v_venue and q.prompt = 'لحمه من الخارج وشعره من الداخل، فما هو؟'
  );

  -- 24. ما الشيء الذي لا يمشي إلا بالضرب؟
  insert into public.questions (venue_id, prompt, choices, correct_index, explanation, mode, category, difficulty)
  select v_venue, 'ما الشيء الذي لا يمشي إلا بالضرب؟', array['الحصان', 'المسمار', 'الكرة', 'الدولاب'], 1, 'المسمار لا يدخل إلا بالضرب.', 'team', 'ألغاز', 'easy'
  where not exists (
    select 1 from public.questions q where q.venue_id = v_venue and q.prompt = 'ما الشيء الذي لا يمشي إلا بالضرب؟'
  );

  -- 25. ابن الماء، ولكن إن تركتني فيه أمت، فمن أنا؟
  insert into public.questions (venue_id, prompt, choices, correct_index, explanation, mode, category, difficulty)
  select v_venue, 'ابن الماء، ولكن إن تركتني فيه أمت، فمن أنا؟', array['الملح', 'الثلج', 'السكر', 'الرمل'], 1, 'الثلج يتكون من الماء ويذوب فيه.', 'team', 'ألغاز', 'easy'
  where not exists (
    select 1 from public.questions q where q.venue_id = v_venue and q.prompt = 'ابن الماء، ولكن إن تركتني فيه أمت، فمن أنا؟'
  );

  -- 26. ما الشيء الذي لونه نفس اسمه؟
  insert into public.questions (venue_id, prompt, choices, correct_index, explanation, mode, category, difficulty)
  select v_venue, 'ما الشيء الذي لونه نفس اسمه؟', array['البرتقالي', 'الليمون', 'البيضة', 'الفحم'], 2, 'البيضة: بيضاء، ولونها من اسمها.', 'team', 'ألغاز', 'medium'
  where not exists (
    select 1 from public.questions q where q.venue_id = v_venue and q.prompt = 'ما الشيء الذي لونه نفس اسمه؟'
  );

  -- 27. من الصحابي الذي لقبه الرسول صلى الله عليه وسلم بالشهيد الحي؟
  insert into public.questions (venue_id, prompt, choices, correct_index, explanation, mode, category, difficulty)
  select v_venue, 'من الصحابي الذي لقبه الرسول صلى الله عليه وسلم بالشهيد الحي؟', array['الزبير بن العوام', 'سعد بن أبي وقاص', 'أبو عبيدة بن الجراح', 'طلحة بن عبيد الله'], 3, 'طلحة بن عبيد الله رضي الله عنه.', 'solo', 'إسلاميات', 'hard'
  where not exists (
    select 1 from public.questions q where q.venue_id = v_venue and q.prompt = 'من الصحابي الذي لقبه الرسول صلى الله عليه وسلم بالشهيد الحي؟'
  );

  -- 28. من القائد المسلم الذي فتح الصين؟
  insert into public.questions (venue_id, prompt, choices, correct_index, explanation, mode, category, difficulty)
  select v_venue, 'من القائد المسلم الذي فتح الصين؟', array['قتيبة بن مسلم', 'خالد بن الوليد', 'عمرو بن العاص', 'محمد الفاتح'], 0, 'قتيبة بن مسلم الباهلي.', 'solo', 'إسلاميات', 'medium'
  where not exists (
    select 1 from public.questions q where q.venue_id = v_venue and q.prompt = 'من القائد المسلم الذي فتح الصين؟'
  );

  -- 29. ما أول دولة استخدمت الغازات السامة في الحروب؟
  insert into public.questions (venue_id, prompt, choices, correct_index, explanation, mode, category, difficulty)
  select v_venue, 'ما أول دولة استخدمت الغازات السامة في الحروب؟', array['فرنسا', 'ألمانيا', 'بريطانيا', 'إيطاليا'], 1, 'ألمانيا في الحرب العالمية الأولى.', 'solo', 'تاريخ', 'medium'
  where not exists (
    select 1 from public.questions q where q.venue_id = v_venue and q.prompt = 'ما أول دولة استخدمت الغازات السامة في الحروب؟'
  );

  -- 30. من الصحابي الذي قاد غزوة ذات السلاسل؟
  insert into public.questions (venue_id, prompt, choices, correct_index, explanation, mode, category, difficulty)
  select v_venue, 'من الصحابي الذي قاد غزوة ذات السلاسل؟', array['خالد بن الوليد', 'عمرو بن العاص', 'أبو عبيدة بن الجراح', 'سعد بن أبي وقاص'], 1, 'عمرو بن العاص رضي الله عنه.', 'team', 'إسلاميات', 'hard'
  where not exists (
    select 1 from public.questions q where q.venue_id = v_venue and q.prompt = 'من الصحابي الذي قاد غزوة ذات السلاسل؟'
  );

  -- 31. ما هو أكبر كوكب في المجموعة الشمسية؟
  insert into public.questions (venue_id, prompt, choices, correct_index, explanation, mode, category, difficulty)
  select v_venue, 'ما هو أكبر كوكب في المجموعة الشمسية؟', array['زحل', 'نبتون', 'المشتري', 'أورانوس'], 2, 'المشتري أكبر كواكب المجموعة الشمسية.', 'solo', 'فضاء', 'easy'
  where not exists (
    select 1 from public.questions q where q.venue_id = v_venue and q.prompt = 'ما هو أكبر كوكب في المجموعة الشمسية؟'
  );

  -- 32. ما هو أقرب الكواكب إلى الشمس؟
  insert into public.questions (venue_id, prompt, choices, correct_index, explanation, mode, category, difficulty)
  select v_venue, 'ما هو أقرب الكواكب إلى الشمس؟', array['عطارد', 'الزهرة', 'الأرض', 'المريخ'], 0, 'عطارد أقرب الكواكب إلى الشمس.', 'solo', 'فضاء', 'easy'
  where not exists (
    select 1 from public.questions q where q.venue_id = v_venue and q.prompt = 'ما هو أقرب الكواكب إلى الشمس؟'
  );

  -- 33. ما هو الغاز الأكثر نسبةً في الغلاف الجوي للأرض؟
  insert into public.questions (venue_id, prompt, choices, correct_index, explanation, mode, category, difficulty)
  select v_venue, 'ما هو الغاز الأكثر نسبةً في الغلاف الجوي للأرض؟', array['الأكسجين', 'النيتروجين', 'ثاني أكسيد الكربون', 'الأرجون'], 1, 'النيتروجين نحو 78% من الغلاف الجوي.', 'team', 'علوم', 'easy'
  where not exists (
    select 1 from public.questions q where q.venue_id = v_venue and q.prompt = 'ما هو الغاز الأكثر نسبةً في الغلاف الجوي للأرض؟'
  );

  -- 34. ما هي المجرة الأقرب لمجرتنا (درب التبانة)؟
  insert into public.questions (venue_id, prompt, choices, correct_index, explanation, mode, category, difficulty)
  select v_venue, 'ما هي المجرة الأقرب لمجرتنا (درب التبانة)؟', array['مجرة سومبريرو', 'مجرة الدوامة', 'المرأة المسلسلة (أندروميدا)', 'سحابة ماجلان الكبرى'], 2, 'مجرة أندروميدا أقرب مجرة كبيرة لنا.', 'team', 'فضاء', 'medium'
  where not exists (
    select 1 from public.questions q where q.venue_id = v_venue and q.prompt = 'ما هي المجرة الأقرب لمجرتنا (درب التبانة)؟'
  );

  -- 35. ما هو الكوكب الذي يُعرف بالكوكب الأحمر؟
  insert into public.questions (venue_id, prompt, choices, correct_index, explanation, mode, category, difficulty)
  select v_venue, 'ما هو الكوكب الذي يُعرف بالكوكب الأحمر؟', array['الزهرة', 'عطارد', 'المريخ', 'المشتري'], 2, 'المريخ لونه أحمر بسبب أكسيد الحديد.', 'solo', 'فضاء', 'easy'
  where not exists (
    select 1 from public.questions q where q.venue_id = v_venue and q.prompt = 'ما هو الكوكب الذي يُعرف بالكوكب الأحمر؟'
  );

  -- 36. ما هو العنصر الكيميائي الأكثر وفرة في الكون؟
  insert into public.questions (venue_id, prompt, choices, correct_index, explanation, mode, category, difficulty)
  select v_venue, 'ما هو العنصر الكيميائي الأكثر وفرة في الكون؟', array['الهيليوم', 'الهيدروجين', 'الأكسجين', 'الكربون'], 1, 'الهيدروجين هو الأكثر وفرة.', 'team', 'علوم', 'medium'
  where not exists (
    select 1 from public.questions q where q.venue_id = v_venue and q.prompt = 'ما هو العنصر الكيميائي الأكثر وفرة في الكون؟'
  );

  -- 37. ما القوة الأساسية التي تحافظ على تماسك الكواكب والنجوم في مداراتها؟
  insert into public.questions (venue_id, prompt, choices, correct_index, explanation, mode, category, difficulty)
  select v_venue, 'ما القوة الأساسية التي تحافظ على تماسك الكواكب والنجوم في مداراتها؟', array['الجاذبية', 'الكهرومغناطيسية', 'النووية القوية', 'النووية الضعيفة'], 0, 'الجاذبية هي القوة المسؤولة عن المدارات.', 'team', 'فضاء', 'easy'
  where not exists (
    select 1 from public.questions q where q.venue_id = v_venue and q.prompt = 'ما القوة الأساسية التي تحافظ على تماسك الكواكب والنجوم في مداراتها؟'
  );

  -- 38. كم تبلغ سرعة الضوء تقريباً في الفراغ؟
  insert into public.questions (venue_id, prompt, choices, correct_index, explanation, mode, category, difficulty)
  select v_venue, 'كم تبلغ سرعة الضوء تقريباً في الفراغ؟', array['150 ألف كم/ث', '300 ألف كم/ث', '1.5 مليون كم/ث', '30 ألف كم/ث'], 1, 'نحو 300,000 كم في الثانية.', 'team', 'علوم', 'easy'
  where not exists (
    select 1 from public.questions q where q.venue_id = v_venue and q.prompt = 'كم تبلغ سرعة الضوء تقريباً في الفراغ؟'
  );

  -- 39. ما هو الكوكب الذي يشتهر بحلقات ضخمة وواضحة حوله؟
  insert into public.questions (venue_id, prompt, choices, correct_index, explanation, mode, category, difficulty)
  select v_venue, 'ما هو الكوكب الذي يشتهر بحلقات ضخمة وواضحة حوله؟', array['المشتري', 'أورانوس', 'زحل', 'نبتون'], 2, 'زحل أشهر الكواكب ذات الحلقات.', 'solo', 'فضاء', 'easy'
  where not exists (
    select 1 from public.questions q where q.venue_id = v_venue and q.prompt = 'ما هو الكوكب الذي يشتهر بحلقات ضخمة وواضحة حوله؟'
  );

  -- 40. كم تستغرق أشعة الشمس للوصول إلى الأرض؟
  insert into public.questions (venue_id, prompt, choices, correct_index, explanation, mode, category, difficulty)
  select v_venue, 'كم تستغرق أشعة الشمس للوصول إلى الأرض؟', array['8 دقائق و20 ثانية', 'دقيقة واحدة', '20 دقيقة', 'ساعة كاملة'], 0, 'نحو 8 دقائق و20 ثانية.', 'team', 'فضاء', 'medium'
  where not exists (
    select 1 from public.questions q where q.venue_id = v_venue and q.prompt = 'كم تستغرق أشعة الشمس للوصول إلى الأرض؟'
  );

  -- 41. ما الكائن البحري الذي يمتلك ثلاثة قلوب؟
  insert into public.questions (venue_id, prompt, choices, correct_index, explanation, mode, category, difficulty)
  select v_venue, 'ما الكائن البحري الذي يمتلك ثلاثة قلوب؟', array['الحوت', 'الأخطبوط', 'السلحفاة', 'القرش'], 1, 'الأخطبوط له ثلاثة قلوب.', 'solo', 'أحياء', 'medium'
  where not exists (
    select 1 from public.questions q where q.venue_id = v_venue and q.prompt = 'ما الكائن البحري الذي يمتلك ثلاثة قلوب؟'
  );

  -- 42. ما أشد الكواكب حرارة رغم أنه ليس الأقرب للشمس؟
  insert into public.questions (venue_id, prompt, choices, correct_index, explanation, mode, category, difficulty)
  select v_venue, 'ما أشد الكواكب حرارة رغم أنه ليس الأقرب للشمس؟', array['عطارد', 'الزهرة', 'المريخ', 'المشتري'], 1, 'الزهرة أشد حرارة بسبب احتباس الغازات.', 'team', 'فضاء', 'medium'
  where not exists (
    select 1 from public.questions q where q.venue_id = v_venue and q.prompt = 'ما أشد الكواكب حرارة رغم أنه ليس الأقرب للشمس؟'
  );

  -- 43. ما أصغر كوكب في المجموعة الشمسية؟
  insert into public.questions (venue_id, prompt, choices, correct_index, explanation, mode, category, difficulty)
  select v_venue, 'ما أصغر كوكب في المجموعة الشمسية؟', array['عطارد', 'المريخ', 'الزهرة', 'الأرض'], 0, 'عطارد أصغر الكواكب.', 'solo', 'فضاء', 'easy'
  where not exists (
    select 1 from public.questions q where q.venue_id = v_venue and q.prompt = 'ما أصغر كوكب في المجموعة الشمسية؟'
  );

  -- 44. ما المنطقة التي لا يستطيع الضوء الهروب منها؟
  insert into public.questions (venue_id, prompt, choices, correct_index, explanation, mode, category, difficulty)
  select v_venue, 'ما المنطقة التي لا يستطيع الضوء الهروب منها؟', array['السديم', 'الثقب الأسود', 'المجرة', 'النجم النيوتروني'], 1, 'الثقب الأسود يجذب حتى الضوء.', 'team', 'فضاء', 'easy'
  where not exists (
    select 1 from public.questions q where q.venue_id = v_venue and q.prompt = 'ما المنطقة التي لا يستطيع الضوء الهروب منها؟'
  );

  -- 45. ما الغاز الأساسي الذي تتكون منه النجوم مثل الشمس؟
  insert into public.questions (venue_id, prompt, choices, correct_index, explanation, mode, category, difficulty)
  select v_venue, 'ما الغاز الأساسي الذي تتكون منه النجوم مثل الشمس؟', array['الهيليوم', 'الهيدروجين', 'النيتروجين', 'الأكسجين'], 1, 'الهيدروجين يتحول إلى هيليوم بالاندماج النووي.', 'team', 'فضاء', 'medium'
  where not exists (
    select 1 from public.questions q where q.venue_id = v_venue and q.prompt = 'ما الغاز الأساسي الذي تتكون منه النجوم مثل الشمس؟'
  );

  -- 46. ما الكوكب الذي يدور محوره بشكل جانبي كأنه يتدحرج؟
  insert into public.questions (venue_id, prompt, choices, correct_index, explanation, mode, category, difficulty)
  select v_venue, 'ما الكوكب الذي يدور محوره بشكل جانبي كأنه يتدحرج؟', array['نبتون', 'زحل', 'أورانوس', 'المريخ'], 2, 'أورانوس يميل محوره نحو 98 درجة.', 'team', 'فضاء', 'hard'
  where not exists (
    select 1 from public.questions q where q.venue_id = v_venue and q.prompt = 'ما الكوكب الذي يدور محوره بشكل جانبي كأنه يتدحرج؟'
  );

  -- 47. ما أقدم مجرة اكتُشفت حتى الآن؟
  insert into public.questions (venue_id, prompt, choices, correct_index, explanation, mode, category, difficulty)
  select v_venue, 'ما أقدم مجرة اكتُشفت حتى الآن؟', array['مجرة GLASS-z12', 'أندروميدا', 'درب التبانة', 'مجرة سومبريرو'], 0, 'GLASS-z12 من أقدم المجرات المرصودة.', 'team', 'فضاء', 'hard'
  where not exists (
    select 1 from public.questions q where q.venue_id = v_venue and q.prompt = 'ما أقدم مجرة اكتُشفت حتى الآن؟'
  );

  -- 48. ماذا يُسمى الحد الفاصل حول الثقب الأسود الذي لا يمكن العودة منه؟
  insert into public.questions (venue_id, prompt, choices, correct_index, explanation, mode, category, difficulty)
  select v_venue, 'ماذا يُسمى الحد الفاصل حول الثقب الأسود الذي لا يمكن العودة منه؟', array['الثقب الأبيض', 'القرص المزود', 'أفق الحدث', 'الإكليل'], 2, 'أفق الحدث هو نقطة اللاعودة.', 'team', 'فضاء', 'medium'
  where not exists (
    select 1 from public.questions q where q.venue_id = v_venue and q.prompt = 'ماذا يُسمى الحد الفاصل حول الثقب الأسود الذي لا يمكن العودة منه؟'
  );

  -- 49. ما الكائن الذي يعود للحياة بعد التجميد ويُعرف بدب الماء؟
  insert into public.questions (venue_id, prompt, choices, correct_index, explanation, mode, category, difficulty)
  select v_venue, 'ما الكائن الذي يعود للحياة بعد التجميد ويُعرف بدب الماء؟', array['النمل', 'الضفدع', 'التارديجرادا (بطيء الماشية)', 'البكتيريا'], 2, 'التارديجرادا يتحمل ظروف الفضاء القاسية.', 'team', 'أحياء', 'medium'
  where not exists (
    select 1 from public.questions q where q.venue_id = v_venue and q.prompt = 'ما الكائن الذي يعود للحياة بعد التجميد ويُعرف بدب الماء؟'
  );

  -- 50. ما المعدن السائل الوحيد في درجة حرارة الغرفة؟
  insert into public.questions (venue_id, prompt, choices, correct_index, explanation, mode, category, difficulty)
  select v_venue, 'ما المعدن السائل الوحيد في درجة حرارة الغرفة؟', array['الزئبق', 'القصدير', 'الرصاص', 'الألمنيوم'], 0, 'الزئبق سائل في درجة حرارة الغرفة.', 'solo', 'علوم', 'easy'
  where not exists (
    select 1 from public.questions q where q.venue_id = v_venue and q.prompt = 'ما المعدن السائل الوحيد في درجة حرارة الغرفة؟'
  );

  -- 51. كم يبلغ عمر الكون التقديري؟
  insert into public.questions (venue_id, prompt, choices, correct_index, explanation, mode, category, difficulty)
  select v_venue, 'كم يبلغ عمر الكون التقديري؟', array['4.6 مليار سنة', '13.8 مليار سنة', '100 مليار سنة', 'مليار سنة'], 1, 'نحو 13.8 مليار سنة.', 'team', 'فضاء', 'medium'
  where not exists (
    select 1 from public.questions q where q.venue_id = v_venue and q.prompt = 'كم يبلغ عمر الكون التقديري؟'
  );

  -- 52. ما الظاهرة التي تتسبب في انحناء الضوء حول الأجسام الضخمة؟
  insert into public.questions (venue_id, prompt, choices, correct_index, explanation, mode, category, difficulty)
  select v_venue, 'ما الظاهرة التي تتسبب في انحناء الضوء حول الأجسام الضخمة؟', array['الانكسار', 'العدسات الجاذبية', 'الانعكاس', 'التشتت'], 1, 'العدسات الجاذبية كما وصفها أينشتاين.', 'team', 'فضاء', 'hard'
  where not exists (
    select 1 from public.questions q where q.venue_id = v_venue and q.prompt = 'ما الظاهرة التي تتسبب في انحناء الضوء حول الأجسام الضخمة؟'
  );

  -- 53. ما المادة التي تشكل نحو 85% من مادة الكون ولا نراها؟
  insert into public.questions (venue_id, prompt, choices, correct_index, explanation, mode, category, difficulty)
  select v_venue, 'ما المادة التي تشكل نحو 85% من مادة الكون ولا نراها؟', array['الطاقة المظلمة', 'البلازما', 'المادة المظلمة', 'الغبار الكوني'], 2, 'المادة المظلمة تُستدل عليها بجاذبيتها.', 'team', 'فضاء', 'medium'
  where not exists (
    select 1 from public.questions q where q.venue_id = v_venue and q.prompt = 'ما المادة التي تشكل نحو 85% من مادة الكون ولا نراها؟'
  );

  -- 54. ما أكبر قمر في المجموعة الشمسية وأكبر من عطارد؟
  insert into public.questions (venue_id, prompt, choices, correct_index, explanation, mode, category, difficulty)
  select v_venue, 'ما أكبر قمر في المجموعة الشمسية وأكبر من عطارد؟', array['تيتان', 'غانيميد', 'القمر', 'أوروبا'], 1, 'غانيميد تابع للمشتري.', 'team', 'فضاء', 'hard'
  where not exists (
    select 1 from public.questions q where q.venue_id = v_venue and q.prompt = 'ما أكبر قمر في المجموعة الشمسية وأكبر من عطارد؟'
  );

  -- 55. ماذا تُسمى النجوم النيوترونية سريعة الدوران التي تصدر حزماً منتظمة؟
  insert into public.questions (venue_id, prompt, choices, correct_index, explanation, mode, category, difficulty)
  select v_venue, 'ماذا تُسمى النجوم النيوترونية سريعة الدوران التي تصدر حزماً منتظمة؟', array['الكوازار', 'السوبرنوفا', 'السديم', 'النجوم النابضة (البلسار)'], 3, 'البلسار يصدر نبضات منتظمة.', 'team', 'فضاء', 'hard'
  where not exists (
    select 1 from public.questions q where q.venue_id = v_venue and q.prompt = 'ماذا تُسمى النجوم النيوترونية سريعة الدوران التي تصدر حزماً منتظمة؟'
  );

  -- 56. ما الجزء الوحيد في جسم الإنسان الذي لا يُصلح نفسه إذا تلف؟
  insert into public.questions (venue_id, prompt, choices, correct_index, explanation, mode, category, difficulty)
  select v_venue, 'ما الجزء الوحيد في جسم الإنسان الذي لا يُصلح نفسه إذا تلف؟', array['الجلد', 'الكبد', 'مينا الأسنان', 'العظام'], 2, 'مينا الأسنان لا يتجدد.', 'team', 'أحياء', 'medium'
  where not exists (
    select 1 from public.questions q where q.venue_id = v_venue and q.prompt = 'ما الجزء الوحيد في جسم الإنسان الذي لا يُصلح نفسه إذا تلف؟'
  );

  -- 57. ما الكوكب الذي يمتلك أقوى رياح تتجاوز 2000 كم/س؟
  insert into public.questions (venue_id, prompt, choices, correct_index, explanation, mode, category, difficulty)
  select v_venue, 'ما الكوكب الذي يمتلك أقوى رياح تتجاوز 2000 كم/س؟', array['المشتري', 'نبتون', 'زحل', 'أورانوس'], 1, 'نبتون أسرع رياح في المجموعة الشمسية.', 'team', 'فضاء', 'medium'
  where not exists (
    select 1 from public.questions q where q.venue_id = v_venue and q.prompt = 'ما الكوكب الذي يمتلك أقوى رياح تتجاوز 2000 كم/س؟'
  );

  -- 58. ما أثقل مادة معروفة تكفي ملعقة منها لتزن مليارات الأطنان؟
  insert into public.questions (venue_id, prompt, choices, correct_index, explanation, mode, category, difficulty)
  select v_venue, 'ما أثقل مادة معروفة تكفي ملعقة منها لتزن مليارات الأطنان؟', array['البلاتين', 'المادة النيوترونية', 'المادة المظلمة', 'الأوزميوم'], 1, 'المادة النيوترونية في النجوم النيوترونية.', 'team', 'فضاء', 'hard'
  where not exists (
    select 1 from public.questions q where q.venue_id = v_venue and q.prompt = 'ما أثقل مادة معروفة تكفي ملعقة منها لتزن مليارات الأطنان؟'
  );

  -- 59. ماذا يُسمى انفجار نجم عملاق في نهاية حياته ويعادل إضاءة مجرة؟
  insert into public.questions (venue_id, prompt, choices, correct_index, explanation, mode, category, difficulty)
  select v_venue, 'ماذا يُسمى انفجار نجم عملاق في نهاية حياته ويعادل إضاءة مجرة؟', array['السديم', 'الكوازار', 'المستعر الأعظم (السوبرنوفا)', 'النيزك'], 2, 'السوبرنوفا انفجار هائل لنجم عملاق.', 'team', 'فضاء', 'medium'
  where not exists (
    select 1 from public.questions q where q.venue_id = v_venue and q.prompt = 'ماذا يُسمى انفجار نجم عملاق في نهاية حياته ويعادل إضاءة مجرة؟'
  );
end $$;

-- التحقق بعد التشغيل: يجب أن يساوي العدد 59
select count(*) as questions_total,
       count(*) filter (where active) as active_questions,
       count(*) filter (where mode = 'solo') as solo_questions,
       count(*) filter (where mode = 'team') as team_questions
from public.questions;
