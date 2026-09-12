import { localize } from '../lib/translations';
import { useEffect, useMemo, useState } from 'react';
import { UserProfile, Course } from '../types';
import { Menu, Plus, Trash2, Calculator, Sparkles, GraduationCap, ArrowLeft } from 'lucide-react';
import { toast } from './Toast';
import {
  GRADE_OPTIONS, GRADE_POINTS, calculateGPA, calculateCGPA, semestersOf,
  totalCredits, projectCGPA, subscribeToCourses, saveCourse, deleteCourse,
} from '../lib/gpa';

interface GpaCalculatorProps {
  profile: UserProfile;
  onMenuClick?: () => void;
  onNavigateBack?: () => void;
}

const gradeColor = (grade: string) => {
  const p = GRADE_POINTS[grade] ?? 0;
  if (p >= 3.7) return 'text-emerald-400 bg-emerald-500/15 border-emerald-500/30';
  if (p >= 3.0) return 'text-cyan-400 bg-cyan-500/15 border-cyan-500/30';
  if (p >= 2.0) return 'text-amber-400 bg-amber-500/15 border-amber-500/30';
  return 'text-rose-400 bg-rose-500/15 border-rose-500/30';
};

export default function GpaCalculator({ profile, onMenuClick, onNavigateBack }: GpaCalculatorProps) {
  const isAr = profile.language === 'Arabic' || profile.language === 'Egyptian Ammiya';
  const [courses, setCourses] = useState<Course[]>([]);

  // Add-course form
  const [name, setName] = useState('');
  const [credits, setCredits] = useState('3');
  const [grade, setGrade] = useState('A');
  const [semester, setSemester] = useState(`Semester 1`);

  // What-if
  const [whatIfCourse, setWhatIfCourse] = useState<string>('');
  const [whatIfGrade, setWhatIfGrade] = useState('A');
  const [whatIfCredits, setWhatIfCredits] = useState('3');

  useEffect(() => {
    if (!profile?.uid) return;
    const unsub = subscribeToCourses(profile.uid, setCourses);
    return () => unsub();
  }, [profile?.uid]);

  const cgpa = useMemo(() => calculateCGPA(courses), [courses]);
  const semesters = useMemo(() => semestersOf(courses), [courses]);
  const creditsTotal = useMemo(() => totalCredits(courses), [courses]);

  const projected = useMemo(() => {
    if (!courses.length && whatIfCourse) return null;
    if (whatIfCourse) {
      return projectCGPA(courses, { courseId: whatIfCourse, grade: whatIfGrade, credits: 0 });
    }
    const numCredits = Number(whatIfCredits);
    const safeCredits = Number.isFinite(numCredits) && numCredits >= 0 ? numCredits : 3;
    return projectCGPA(courses, { courseId: null, grade: whatIfGrade, credits: safeCredits });
  }, [courses, whatIfCourse, whatIfGrade, whatIfCredits]);

  const t = (en: string, ar: string) => localize(profile?.language, en, ar);

  const addCourse = async () => {
    if (!name.trim() || !profile?.uid) return;
    const course: Course = {
      id: `c-${Date.now()}`,
      name: name.trim(),
      credits: Math.max(0, Number(credits) || 0),
      grade,
      semester: semester.trim() || 'Semester 1',
      createdAt: new Date().toISOString(),
    };
    try {
      await saveCourse(profile.uid, course);
      setName('');
      toast.success(t('Course added.', 'تمت إضافة المادة.'), t('Saved', 'تم الحفظ'));
    } catch (err) {
      console.error('Failed to add course:', err);
      toast.error(t('Failed to add course.', 'فشل إضافة المادة.'), t('Error', 'خطأ'));
    }
  };

  const handleDeleteCourse = async (courseId: string) => {
    if (!profile?.uid) return;
    try {
      await deleteCourse(profile.uid, courseId);
      toast.success(t('Course removed.', 'تم حذف المادة.'), t('Deleted', 'تم الحذف'));
    } catch (err) {
      console.error('Failed to delete course:', err);
      toast.error(t('Failed to delete course.', 'فشل حذف المادة.'), t('Error', 'خطأ'));
    }
  };

  return (
    <div dir={isAr ? 'rtl' : 'ltr'} className="flex-1 h-screen overflow-y-auto bg-[#0A0C14] text-slate-100 relative selection:bg-cyan-500/30 selection:text-white overflow-x-hidden font-sans flex flex-col custom-scrollbar p-6 md:p-10 gap-6">
      {/* Ambient Lighting Orbs */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden -z-10">
        <div className="absolute -top-40 -left-40 w-[600px] h-[600px] bg-indigo-500/10 rounded-full blur-[140px]" />
        <div className="absolute top-1/2 -right-40 w-[600px] h-[600px] bg-cyan-500/10 rounded-full blur-[140px]" />
        <div className="absolute -bottom-40 left-1/3 w-[600px] h-[600px] bg-purple-500/10 rounded-full blur-[140px]" />
      </div>

      <header className="flex items-start gap-4">
        {onNavigateBack && (
          <button
            onClick={onNavigateBack}
            className="p-2.5 mt-1 text-slate-400 hover:text-white bg-slate-900/80 hover:bg-slate-800/90 border border-slate-800 rounded-xl active:scale-95 transition-all flex items-center gap-1.5 shrink-0 shadow-md"
            title={t('Back to Assistant', 'العودة للمساعد')}
          >
            <ArrowLeft className="w-5 h-5 rtl:rotate-180" />
            <span className="text-xs font-bold hidden sm:inline">{t('Back', 'رجوع')}</span>
          </button>
        )}
        {onMenuClick && (
          <button
            onClick={onMenuClick}
            className="p-2.5 mt-1 text-slate-400 hover:text-white bg-slate-900/80 hover:bg-slate-800/90 border border-slate-800 rounded-xl active:scale-95 transition-all shrink-0 shadow-md"
            aria-label={t('Toggle menu', 'القائمة')}
            title={t('Open Menu', 'فتح القائمة')}
          >
            <Menu className="w-5 h-5" />
          </button>
        )}
        <div>
          <h1 className="text-2xl md:text-4xl font-black text-white tracking-tight uppercase flex items-center gap-3">
            <span className="p-2 rounded-2xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
              <Calculator className="w-7 h-7" />
            </span>
            {t('GPA Calculator', 'حاسبة الـ GPA')}
          </h1>
          <p className="text-xs md:text-sm text-slate-400 font-medium italic mt-1.5">
            {t('Track your grades, CGPA, and run what-if scenarios.', 'تابع درجاتك والـ CGPA وجرّب سيناريوهات "لو".')}
          </p>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 max-w-6xl w-full">
        {/* CGPA summary */}
        <div className="bg-[#121524]/90 border border-slate-800/80 text-white rounded-3xl p-6 flex flex-col justify-center items-center shadow-2xl backdrop-blur-xl relative overflow-hidden group">
          <div className="absolute -top-16 -right-16 w-32 h-32 bg-cyan-500/10 rounded-full blur-2xl group-hover:scale-150 transition-transform" />
          <span className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400">{t('Cumulative GPA', 'المعدل التراكمي')}</span>
          <span className="text-6xl font-black mt-3 text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-teal-300 to-emerald-400 drop-shadow-sm font-mono">{cgpa.toFixed(2)}</span>
          <span className="text-xs text-slate-400 mt-2 font-medium">{creditsTotal} {t('credit hours', 'ساعة معتمدة')} · {courses.length} {t('courses', 'مادة')}</span>
        </div>

        {/* What-if */}
        <div className="lg:col-span-2 bg-[#121524]/90 rounded-3xl p-6 border border-slate-800/80 shadow-2xl backdrop-blur-xl">
          <h2 className="text-xs font-black uppercase tracking-widest text-slate-300 flex items-center gap-2 mb-4">
            <Sparkles className="w-4 h-4 text-cyan-400" /> {t('What-if Analysis', 'تحليل "ماذا لو"')}
          </h2>
          <div className="flex flex-wrap items-end gap-3.5">
            <label className="flex flex-col gap-1.5">
              <span className="text-[10px] font-bold uppercase text-slate-400">{t('Course', 'المادة')}</span>
              <select
                value={whatIfCourse}
                onChange={(e) => setWhatIfCourse(e.target.value)}
                className="bg-[#0A0C14] border border-slate-800 text-white text-xs font-semibold rounded-2xl px-4 py-3 outline-none focus:border-cyan-500/60 focus:ring-2 focus:ring-cyan-500/10 transition-all cursor-pointer"
              >
                <option value="" className="bg-slate-900 text-white">{t('New hypothetical course', 'مادة افتراضية جديدة')}</option>
                {courses.map((c) => <option key={c.id} value={c.id} className="bg-slate-900 text-white">{c.name}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-[10px] font-bold uppercase text-slate-400">{t('Grade', 'الدرجة')}</span>
              <select
                dir="ltr"
                value={whatIfGrade}
                onChange={(e) => setWhatIfGrade(e.target.value)}
                className="bg-[#0A0C14] border border-slate-800 text-white text-xs font-semibold rounded-2xl px-4 py-3 outline-none focus:border-cyan-500/60 focus:ring-2 focus:ring-cyan-500/10 transition-all cursor-pointer font-mono"
              >
                {GRADE_OPTIONS.map((g) => <option key={g} value={g} className="bg-slate-900 text-white">{g}</option>)}
              </select>
            </label>
            <div className="flex flex-col gap-1.5">
              <span className="text-[10px] font-bold uppercase text-slate-400">{t('Projected CGPA', 'المعدل المتوقّع')}</span>
              <div className="px-5 py-2.5 rounded-2xl bg-cyan-500/15 border border-cyan-500/30 text-cyan-400 font-black text-lg min-w-[90px] text-center font-mono shadow-sm">
                {projected !== null ? projected.toFixed(2) : '—'}
              </div>
            </div>
            {projected !== null && (
              <span className={`text-xs font-black px-3 py-1.5 rounded-xl border ${projected >= cgpa ? 'text-emerald-400 bg-emerald-500/15 border-emerald-500/30' : 'text-rose-400 bg-rose-500/15 border-rose-500/30'}`}>
                {projected >= cgpa ? '▲' : '▼'} {Math.abs(projected - cgpa).toFixed(2)}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Add course */}
      <div className="bg-[#121524]/90 rounded-3xl p-6 border border-slate-800/80 shadow-2xl backdrop-blur-xl max-w-6xl w-full">
        <h2 className="text-xs font-black uppercase tracking-widest text-slate-300 mb-4 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-cyan-400" />
          {t('Add a course', 'إضافة مادة')}
        </h2>
        <div className="flex flex-wrap items-end gap-3.5">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('Course name', 'اسم المادة')}
            onKeyDown={(e) => e.key === 'Enter' && addCourse()}
            className="flex-1 min-w-[180px] bg-[#0A0C14] border border-slate-800 text-white placeholder-slate-500 text-xs font-semibold rounded-2xl px-4 py-3 outline-none focus:border-cyan-500/60 focus:ring-2 focus:ring-cyan-500/10 transition-all"
          />
          <input
            value={semester}
            onChange={(e) => setSemester(e.target.value)}
            placeholder={t('Semester', 'الترم')}
            className="w-36 bg-[#0A0C14] border border-slate-800 text-white placeholder-slate-500 text-xs font-semibold rounded-2xl px-4 py-3 outline-none focus:border-cyan-500/60 focus:ring-2 focus:ring-cyan-500/10 transition-all"
          />
          <input
            type="number"
            min={0}
            max={12}
            value={credits}
            onChange={(e) => setCredits(e.target.value)}
            className="w-24 bg-[#0A0C14] border border-slate-800 text-white text-xs font-semibold rounded-2xl px-4 py-3 outline-none focus:border-cyan-500/60 focus:ring-2 focus:ring-cyan-500/10 transition-all font-mono"
            title={t('Credits', 'الساعات')}
          />
          <select
            dir="ltr"
            value={grade}
            onChange={(e) => setGrade(e.target.value)}
            className="w-24 bg-[#0A0C14] border border-slate-800 text-white text-xs font-semibold rounded-2xl px-4 py-3 outline-none focus:border-cyan-500/60 focus:ring-2 focus:ring-cyan-500/10 transition-all cursor-pointer font-mono"
          >
            {GRADE_OPTIONS.map((g) => <option key={g} value={g} className="bg-slate-900 text-white">{g}</option>)}
          </select>
          <button
            onClick={addCourse}
            disabled={!name.trim()}
            className="px-6 py-3 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white rounded-2xl font-black text-xs uppercase tracking-wider shadow-lg shadow-cyan-500/20 active:scale-95 disabled:opacity-40 transition-all flex items-center gap-2"
          >
            <Plus className="w-4 h-4" /> {t('Add', 'إضافة')}
          </button>
        </div>
      </div>

      {/* Courses by semester */}
      <div className="max-w-6xl w-full space-y-6 pb-12">
        {courses.length === 0 && (
          <div className="text-center text-slate-500 py-16 flex flex-col items-center gap-3 bg-[#121524]/40 border border-slate-800/40 rounded-3xl">
            <GraduationCap className="w-12 h-12 text-slate-600" />
            <p className="font-medium text-sm text-slate-400">{t('No courses yet — add your first course above.', 'لسه مفيش مواد — ضيف أول مادة من فوق.')}</p>
          </div>
        )}
        {semesters.map((sem) => {
          const semCourses = courses.filter((c) => (c.semester || 'Unspecified') === sem);
          return (
            <div key={sem} className="bg-[#121524]/90 rounded-3xl border border-slate-800/80 shadow-xl overflow-hidden backdrop-blur-xl">
              <div className="flex items-center justify-between px-6 py-4 bg-slate-900/90 border-b border-slate-800">
                <h3 className="font-black text-white text-xs uppercase tracking-widest">{sem}</h3>
                <span className="text-xs font-bold text-slate-400">GPA: <span className="text-cyan-400 font-mono font-black">{calculateGPA(semCourses).toFixed(2)}</span></span>
              </div>
              <div className="divide-y divide-slate-800/60">
                {semCourses.map((c) => (
                  <div key={c.id} className="flex items-center gap-3 px-6 py-3.5 hover:bg-slate-900/40 transition-colors">
                    <span className="flex-1 font-bold text-slate-100 text-sm">{c.name}</span>
                    <span className="text-xs text-slate-400 font-mono">{c.credits} {t('cr', 'س')}</span>
                    <span dir="ltr" className={`text-xs font-black px-2.5 py-1 rounded-lg border font-mono ${gradeColor(c.grade)}`}>{c.grade}</span>
                    <button
                      onClick={() => handleDeleteCourse(c.id)}
                      className="p-1.5 text-slate-500 hover:text-rose-400 transition-colors"
                      title={t('Delete', 'حذف')}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
