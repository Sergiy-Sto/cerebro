import { useState } from 'react';
import type { Project } from '../state/types';

interface ProjectFormData {
  title: string;
  frame: string;
  constraints: string[];
  criteria: string[];
}

interface ProjectFormProps {
  project?: Project;
  onSave: (data: ProjectFormData) => void;
  onCancel: () => void;
}

export default function ProjectForm({ project, onSave, onCancel }: ProjectFormProps) {
  const [title, setTitle] = useState(project?.title ?? '');
  const [frame, setFrame] = useState(project?.frame ?? '');
  const [constraints, setConstraints] = useState<string[]>(project?.constraints ?? []);
  const [criteria, setCriteria] = useState<string[]>(project?.criteria ?? []);
  const [constraintInput, setConstraintInput] = useState('');
  const [criterionInput, setCriterionInput] = useState('');
  const [errors, setErrors] = useState<string[]>([]);

  const isEdit = !!project;

  function validate(): boolean {
    const errs: string[] = [];
    if (!title.trim()) errs.push('Название обязательно.');
    if (!frame.trim()) errs.push('Фрейм обязателен.');
    setErrors(errs);
    return errs.length === 0;
  }

  function handleSubmit() {
    if (!validate()) return;
    onSave({ title: title.trim(), frame: frame.trim(), constraints, criteria });
  }

  function addConstraint() {
    if (!constraintInput.trim()) return;
    setConstraints([...constraints, constraintInput.trim()]);
    setConstraintInput('');
  }

  function removeConstraint(i: number) {
    setConstraints(constraints.filter((_, idx) => idx !== i));
  }

  function addCriterion() {
    if (!criterionInput.trim()) return;
    setCriteria([...criteria, criterionInput.trim()]);
    setCriterionInput('');
  }

  function removeCriterion(i: number) {
    setCriteria(criteria.filter((_, idx) => idx !== i));
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white border border-gray-200 p-6 w-full max-w-lg overflow-y-auto max-h-screen">
        <h3 className="text-sm font-semibold text-gray-900 mb-4">
          {isEdit ? 'Редактировать проект' : 'Новый проект'}
        </h3>

        {errors.length > 0 && (
          <div className="mb-3 p-2 bg-red-50 border border-red-200 text-xs text-red-700 space-y-1">
            {errors.map((e, i) => <div key={i}>{e}</div>)}
          </div>
        )}

        {/* Title */}
        <div className="mb-3">
          <label className="block text-xs text-gray-600 mb-1">Название *</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
            placeholder="Название проекта"
          />
        </div>

        {/* Frame */}
        <div className="mb-3">
          <label className="block text-xs text-gray-600 mb-1">Фрейм (постановка проблемы) *</label>
          <textarea
            value={frame}
            onChange={(e) => setFrame(e.target.value)}
            rows={3}
            className="w-full border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 resize-y"
            placeholder="Опишите ключевую проблему или возможность..."
          />
        </div>

        {/* Constraints */}
        <div className="mb-3">
          <label className="block text-xs text-gray-600 mb-1">Ограничения</label>
          <p className="text-xs text-gray-400 mb-1.5">Что ограничивает решение? Например: «бюджет до $50K», «только мобайл», «не менять текущий процесс»</p>
          <div className="flex gap-2 mb-1">
            <input
              type="text"
              value={constraintInput}
              onChange={(e) => setConstraintInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addConstraint()}
              className="flex-1 border border-gray-300 px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
              placeholder="Добавить ограничение..."
            />
            <button
              onClick={addConstraint}
              className="px-3 py-1 text-xs border border-gray-300 text-gray-700 hover:bg-gray-50"
            >
              Добавить
            </button>
          </div>
          {constraints.length > 0 && (
            <ul className="space-y-1">
              {constraints.map((c, i) => (
                <li key={i} className="flex items-center gap-2 text-xs text-gray-700">
                  <span className="flex-1 bg-gray-50 border border-gray-200 px-2 py-1">{c}</span>
                  <button
                    onClick={() => removeConstraint(i)}
                    className="text-red-500 hover:text-red-700 text-xs"
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Criteria */}
        <div className="mb-5">
          <label className="block text-xs text-gray-600 mb-1">Критерии успеха</label>
          <p className="text-xs text-gray-400 mb-1.5">Как поймёте, что гипотеза сработала? Например: «50% экономии времени», «1000 пользователей за 3 месяца»</p>
          <div className="flex gap-2 mb-1">
            <input
              type="text"
              value={criterionInput}
              onChange={(e) => setCriterionInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addCriterion()}
              className="flex-1 border border-gray-300 px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
              placeholder="Добавить критерий..."
            />
            <button
              onClick={addCriterion}
              className="px-3 py-1 text-xs border border-gray-300 text-gray-700 hover:bg-gray-50"
            >
              Добавить
            </button>
          </div>
          {criteria.length > 0 && (
            <ul className="space-y-1">
              {criteria.map((c, i) => (
                <li key={i} className="flex items-center gap-2 text-xs text-gray-700">
                  <span className="flex-1 bg-gray-50 border border-gray-200 px-2 py-1">{c}</span>
                  <button
                    onClick={() => removeCriterion(i)}
                    className="text-red-500 hover:text-red-700 text-xs"
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex gap-2 justify-end">
          <button
            onClick={onCancel}
            className="px-3 py-1.5 text-sm border border-gray-300 text-gray-700 hover:bg-gray-50"
          >
            Отмена
          </button>
          <button
            onClick={handleSubmit}
            className="px-3 py-1.5 text-sm bg-blue-600 text-white hover:bg-blue-700"
          >
            {isEdit ? 'Сохранить' : 'Создать проект'}
          </button>
        </div>
      </div>
    </div>
  );
}
