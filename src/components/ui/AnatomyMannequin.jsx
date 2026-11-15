import React from 'react';
import { Activity } from 'lucide-react';
import './AnatomyMannequin.css';

function MusclePath({ d, active, label, group, onSelectGroup }) {
  const select = () => onSelectGroup?.(group);

  return (
    <path
      d={d}
      className={`muscle-path ${active ? 'active-muscle' : 'base-muscle'}`}
      role="button"
      tabIndex={0}
      aria-label={`Destacar ${label}`}
      aria-pressed={active}
      onClick={select}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          select();
        }
      }}
    />
  );
}

function FrontFigure({ groups, onSelectGroup }) {
  const muscle = (d, label, group, active = groups[group]) => (
    <MusclePath
      key={`${group}-${label}-${d.slice(0, 12)}`}
      d={d}
      label={label}
      group={group}
      active={active}
      onSelectGroup={onSelectGroup}
    />
  );

  return (
    <svg viewBox="0 0 200 380" className="anatomy-svg" xmlns="http://www.w3.org/2000/svg" role="group" aria-label="Vista frontal do mapa muscular">
      <ellipse cx="100" cy="35" rx="16" ry="20" className="mannequin-base-part" />
      <path d="M92 53 L90 68 L110 68 L108 53Z" className="mannequin-base-part" />
      <path d="M68 71 C59 73 54 80 52 90 L47 124 C42 138 40 158 45 175 L41 197 C39 203 42 209 47 210 C52 210 55 205 57 198 L65 171 L67 146 L63 136 L68 111 C72 97 77 87 84 82Z" className="mannequin-silhouette" />
      <path d="M132 71 C141 73 146 80 148 90 L153 124 C158 138 160 158 155 175 L159 197 C161 203 158 209 153 210 C148 210 145 205 143 198 L135 171 L133 146 L137 136 L132 111 C128 97 123 87 116 82Z" className="mannequin-silhouette" />
      <path d="M80 169 C72 175 68 188 68 205 C66 226 69 247 74 263 L77 279 L74 348 L66 365 C63 370 67 373 72 373 L84 373 C88 371 89 367 90 361 L99 283 L97 218 C96 197 89 178 80 169Z" className="mannequin-silhouette" />
      <path d="M120 169 C128 175 132 188 132 205 C134 226 131 247 126 263 L123 279 L126 348 L134 365 C137 370 133 373 128 373 L116 373 C112 371 111 367 110 361 L101 283 L103 218 C104 197 111 178 120 169Z" className="mannequin-silhouette" />
      <path d="M92 60 C82 62 73 67 67 72 C61 77 57 84 56 94 C58 102 64 107 72 107 L76 103 C72 121 72 140 77 157 L80 172 C86 180 92 185 100 188 C108 185 114 180 120 172 L123 157 C128 140 128 121 124 103 L128 107 C136 107 142 102 144 94 C143 84 139 77 133 72 C127 67 118 62 108 60Z" className="mannequin-silhouette" />

      {muscle('M88 56 L70 72 L90 68Z M112 56 L130 72 L110 68Z', 'Trapézio', 'Trapézio')}
      {muscle('M68 72 C55 76 48 90 52 105 C57 106 66 98 72 88 C74 80 72 74 68 72Z', 'Ombro', 'Ombros')}
      {muscle('M132 72 C145 76 152 90 148 105 C143 106 134 98 128 88 C126 80 128 74 132 72Z', 'Ombro', 'Ombros')}
      {muscle('M72 76 C80 71 90 72 98 77 L98 104 C89 108 79 104 73 98 C70 92 69 83 72 76Z', 'Peitoral', 'Peitoral')}
      {muscle('M128 76 C120 71 110 72 102 77 L102 104 C111 108 121 104 127 98 C130 92 131 83 128 76Z', 'Peitoral', 'Peitoral')}
      {muscle('M52 105 C48 116 48 132 55 142 C60 140 64 128 64 116 C64 108 58 104 52 105Z', 'Bíceps', 'Bíceps')}
      {muscle('M148 105 C152 116 152 132 145 142 C140 140 136 128 136 116 C136 108 142 104 148 105Z', 'Bíceps', 'Bíceps')}
      {muscle('M54 144 C44 158 40 180 46 195 L53 194 C58 180 62 160 62 144Z', 'Antebraço', 'Antebraço')}
      {muscle('M146 144 C156 158 160 180 154 195 L147 194 C142 180 138 160 138 144Z', 'Antebraço', 'Antebraço')}
      <circle cx="48" cy="205" r="7" className="mannequin-base-part" />
      <circle cx="152" cy="205" r="7" className="mannequin-base-part" />
      {muscle('M77 112 C83 109 91 110 98 112 L98 125 C91 127 83 126 77 124Z M123 112 C117 109 109 110 102 112 L102 125 C109 127 117 126 123 124Z M78 129 C84 127 92 128 98 129 L98 143 C92 145 84 144 78 142Z M122 129 C116 127 108 128 102 129 L102 143 C108 145 116 144 122 142Z M80 147 C86 145 92 146 98 147 L98 163 C92 165 86 164 82 162Z M120 147 C114 145 108 146 102 147 L102 163 C108 165 114 164 118 162Z', 'Abdômen', 'Abdômen')}
      {muscle('M70 115 C68 135 72 155 78 165 L75 167 C68 152 65 130 68 115Z M130 115 C132 135 128 155 122 165 L125 167 C132 152 135 130 132 115Z', 'Abdômen', 'Abdômen')}
      <path d="M80 167 L120 167 L100 186Z" className="mannequin-base-part" />
      {muscle('M79 173 C70 179 66 194 67 212 C67 231 72 249 77 261 C84 263 89 254 92 241 C95 221 94 195 94 177 C89 174 84 173 79 173Z', 'Quadríceps', 'Pernas')}
      {muscle('M121 173 C130 179 134 194 133 212 C133 231 128 249 123 261 C116 263 111 254 108 241 C105 221 106 195 106 177 C111 174 116 173 121 173Z', 'Quadríceps', 'Pernas')}
      <circle cx="78" cy="272" r="7" className="mannequin-base-part" />
      <circle cx="122" cy="272" r="7" className="mannequin-base-part" />
      {muscle('M72 280 C64 300 66 332 72 352 L84 352 C88 335 88 305 84 280Z', 'Panturrilha', 'Pernas')}
      {muscle('M128 280 C136 300 134 332 128 352 L116 352 C112 335 112 305 116 280Z', 'Panturrilha', 'Pernas')}

      <g className="mannequin-detail-lines" aria-hidden="true">
        <path d="M91 34 Q95 32 98 34 M102 34 Q105 32 109 34 M100 35 L100 41 M96 46 Q100 49 104 46" />
        <path d="M73 79 Q86 72 99 78 M101 78 Q114 72 127 79 M100 112 V163 M78 128 H98 M102 128 H122 M79 146 H98 M102 146 H121" />
        <path d="M100 187 V252 M70 197 Q76 203 89 204 M111 204 Q124 203 130 197 M75 204 Q82 210 89 211 M125 204 Q118 210 111 211" />
        <path d="M87 76 C81 82 78 92 80 101 M113 76 C119 82 122 92 120 101 M72 80 C65 88 63 98 65 106 M128 80 C135 88 137 98 135 106" />
        <path d="M56 110 C62 114 65 124 62 137 M144 110 C138 114 135 124 138 137 M68 117 C72 130 73 145 78 158 M132 117 C128 130 127 145 122 158" />
        <path d="M82 174 C84 190 88 205 91 218 M118 174 C116 190 112 205 109 218 M78 229 C83 235 88 237 95 234 M122 229 C117 235 112 237 105 234" />
        <path d="M73 291 C78 296 83 296 88 292 M127 291 C122 296 117 296 112 292" />
      </g>
      <path d="M68 354 L84 354 L80 370 L62 370Z M132 354 L116 354 L120 370 L138 370Z" className="mannequin-base-part" />
    </svg>
  );
}

function BackFigure({ groups, onSelectGroup }) {
  const muscle = (d, label, group, active = groups[group]) => (
    <MusclePath
      key={`${group}-${label}-${d.slice(0, 12)}`}
      d={d}
      label={label}
      group={group}
      active={active}
      onSelectGroup={onSelectGroup}
    />
  );

  return (
    <svg viewBox="0 0 200 380" className="anatomy-svg" xmlns="http://www.w3.org/2000/svg" role="group" aria-label="Vista posterior do mapa muscular">
      <ellipse cx="100" cy="35" rx="16" ry="20" className="mannequin-base-part" />
      <path d="M92 53 L90 68 L110 68 L108 53Z" className="mannequin-base-part" />
      <path d="M68 71 C59 73 54 80 52 90 L47 124 C42 138 40 158 45 175 L41 197 C39 203 42 209 47 210 C52 210 55 205 57 198 L65 171 L67 146 L63 136 L68 111 C72 97 77 87 84 82Z" className="mannequin-silhouette" />
      <path d="M132 71 C141 73 146 80 148 90 L153 124 C158 138 160 158 155 175 L159 197 C161 203 158 209 153 210 C148 210 145 205 143 198 L135 171 L133 146 L137 136 L132 111 C128 97 123 87 116 82Z" className="mannequin-silhouette" />
      <path d="M80 169 C72 175 68 188 68 205 C66 226 69 247 74 263 L77 279 L74 348 L66 365 C63 370 67 373 72 373 L84 373 C88 371 89 367 90 361 L99 283 L97 218 C96 197 89 178 80 169Z" className="mannequin-silhouette" />
      <path d="M120 169 C128 175 132 188 132 205 C134 226 131 247 126 263 L123 279 L126 348 L134 365 C137 370 133 373 128 373 L116 373 C112 371 111 367 110 361 L101 283 L103 218 C104 197 111 178 120 169Z" className="mannequin-silhouette" />
      <path d="M92 60 C82 62 73 67 67 72 C61 77 57 84 56 94 C58 102 64 107 72 107 L76 103 C72 121 72 140 77 157 L80 172 C86 180 92 185 100 188 C108 185 114 180 120 172 L123 157 C128 140 128 121 124 103 L128 107 C136 107 142 102 144 94 C143 84 139 77 133 72 C127 67 118 62 108 60Z" className="mannequin-silhouette" />

      {muscle('M88 56 L68 72 L98 96 L98 68Z M112 56 L132 72 L102 96 L102 68Z', 'Trapézio', 'Trapézio', groups.Trapézio || groups.Costas)}
      {muscle('M68 72 C55 76 48 90 52 105 C57 106 66 98 72 88 C74 80 72 74 68 72Z', 'Ombro', 'Ombros')}
      {muscle('M132 72 C145 76 152 90 148 105 C143 106 134 98 128 88 C126 80 128 74 132 72Z', 'Ombro', 'Ombros')}
      {muscle('M72 88 C65 110 68 140 76 158 L98 152 L98 98Z', 'Costas', 'Costas')}
      {muscle('M128 88 C135 110 132 140 124 158 L102 152 L102 98Z', 'Costas', 'Costas')}
      {muscle('M78 155 L98 155 L98 172 L80 172Z M102 155 L122 155 L120 172 L102 172Z', 'Lombar', 'Costas')}
      {muscle('M52 105 C46 116 46 134 54 144 C60 142 64 130 64 116 C64 108 58 104 52 105Z', 'Tríceps', 'Tríceps')}
      {muscle('M148 105 C154 116 154 134 146 144 C140 142 136 130 136 116 C136 108 142 104 148 105Z', 'Tríceps', 'Tríceps')}
      {muscle('M54 144 C44 158 40 180 46 195 L53 194 C58 180 62 160 62 144Z', 'Antebraço', 'Antebraço')}
      {muscle('M146 144 C156 158 160 180 154 195 L147 194 C142 180 138 160 138 144Z', 'Antebraço', 'Antebraço')}
      <circle cx="48" cy="205" r="7" className="mannequin-base-part" />
      <circle cx="152" cy="205" r="7" className="mannequin-base-part" />
      {muscle('M78 174 C68 185 68 215 80 226 C92 226 98 215 98 174Z', 'Glúteos', 'Pernas')}
      {muscle('M122 174 C132 185 132 215 120 226 C108 226 102 215 102 174Z', 'Glúteos', 'Pernas')}
      {muscle('M76 228 C68 240 68 258 74 268 C82 268 90 260 94 248 C96 238 96 230 96 228Z', 'Posterior de coxa', 'Pernas')}
      {muscle('M124 228 C132 240 132 258 126 268 C118 268 110 260 106 248 C104 238 104 230 104 228Z', 'Posterior de coxa', 'Pernas')}
      <circle cx="78" cy="274" r="6" className="mannequin-base-part" />
      <circle cx="122" cy="274" r="6" className="mannequin-base-part" />
      {muscle('M72 280 C62 298 62 328 72 352 L86 352 C92 328 90 298 84 280Z', 'Panturrilha', 'Pernas')}
      {muscle('M128 280 C138 298 138 328 128 352 L114 352 C108 328 110 298 116 280Z', 'Panturrilha', 'Pernas')}
      <g className="mannequin-detail-lines" aria-hidden="true">
        <path d="M72 78 Q86 70 99 77 M101 77 Q114 70 128 78 M100 72 C97 103 103 136 100 171 M75 95 Q83 119 78 148 M125 95 Q117 119 122 148" />
        <path d="M100 177 V221 M81 223 Q90 229 99 226 M101 226 Q110 229 119 223 M100 231 V258" />
        <path d="M89 66 C85 77 86 89 98 99 M111 66 C115 77 114 89 102 99 M68 78 C78 82 88 91 93 101 M132 78 C122 82 112 91 107 101" />
        <path d="M71 94 C76 109 78 128 82 145 M129 94 C124 109 122 128 118 145 M53 111 C59 116 62 128 60 139 M147 111 C141 116 138 128 140 139" />
        <path d="M54 150 C60 160 62 176 58 190 M146 150 C140 160 138 176 142 190 M79 177 C85 185 92 188 99 188 M121 177 C115 185 108 188 101 188" />
        <path d="M76 233 C81 238 88 240 94 238 M124 233 C119 238 112 240 106 238 M72 292 C77 298 83 299 88 294 M128 292 C123 298 117 299 112 294" />
      </g>
      <path d="M68 354 L86 354 L84 370 L70 370Z M132 354 L114 354 L116 370 L130 370Z" className="mannequin-base-part" />
    </svg>
  );
}

function SideFigure({ groups, onSelectGroup }) {
  return (
    <svg viewBox="0 0 200 380" className="anatomy-svg" xmlns="http://www.w3.org/2000/svg" role="group" aria-label="Vista lateral do mapa muscular">
      <path d="M91 17 C101 12 111 17 112 26 L119 32 L114 37 C115 45 108 51 102 53 L102 63 C112 67 123 75 126 88 L130 106 C133 119 130 135 126 150 L121 166 C120 174 124 185 128 198 L133 222 C136 238 133 254 129 267 L125 280 L128 347 L137 365 C139 370 136 373 131 373 L113 373 C109 372 108 368 108 364 L103 285 L98 264 C94 250 91 239 91 226 L88 196 C86 184 82 176 77 166 L68 148 C62 135 61 119 65 105 L69 86 C72 73 80 66 91 62 L91 52 C85 48 81 41 82 34 C80 26 84 20 91 17Z" className="mannequin-silhouette" />
      <MusclePath d="M91 69 C79 72 71 82 72 96 C78 100 88 95 94 86Z" label="Ombro" group="Ombros" active={groups.Ombros} onSelectGroup={onSelectGroup} />
      <MusclePath d="M97 76 C108 78 116 86 117 96 C111 101 103 98 97 92Z" label="Peitoral" group="Peitoral" active={groups.Peitoral} onSelectGroup={onSelectGroup} />
      <MusclePath d="M76 94 C71 111 75 132 84 149 L98 158 L98 99Z" label="Costas" group="Costas" active={groups.Costas} onSelectGroup={onSelectGroup} />
      <MusclePath d="M91 61 L77 76 L96 91 L99 70Z" label="Trapézio" group="Trapézio" active={groups.Trapézio} onSelectGroup={onSelectGroup} />
      <MusclePath d="M72 98 C63 107 62 124 68 138 L78 139 C83 126 83 110 79 101Z" label="Bíceps" group="Bíceps" active={groups.Bíceps} onSelectGroup={onSelectGroup} />
      <MusclePath d="M68 139 C62 151 66 167 76 179 L83 175 C81 162 80 149 78 139Z" label="Antebraço" group="Antebraço" active={groups.Antebraço} onSelectGroup={onSelectGroup} />
      <MusclePath d="M99 101 L114 101 C116 119 111 139 105 153 L97 151Z" label="Abdômen" group="Abdômen" active={groups.Abdômen} onSelectGroup={onSelectGroup} />
      <MusclePath d="M82 165 C73 174 76 190 88 201 L99 194 L98 167Z" label="Glúteos" group="Pernas" active={groups.Pernas} onSelectGroup={onSelectGroup} />
      <MusclePath d="M99 184 C109 188 118 201 120 220 L119 254 C113 263 104 262 99 250 L94 218Z" label="Quadríceps" group="Pernas" active={groups.Pernas} onSelectGroup={onSelectGroup} />
      <MusclePath d="M87 193 C79 207 82 233 89 255 C95 262 102 257 104 246 L98 211Z" label="Posterior de coxa" group="Pernas" active={groups.Pernas} onSelectGroup={onSelectGroup} />
      <MusclePath d="M103 277 C97 299 102 330 109 351 L123 351 C127 330 124 300 119 278Z" label="Panturrilha" group="Pernas" active={groups.Pernas} onSelectGroup={onSelectGroup} />
      <g className="mannequin-detail-lines" aria-hidden="true">
        <path d="M87 78 Q94 71 101 75 M98 100 C100 120 100 140 98 158 M93 198 C92 218 96 241 100 256 M104 285 L110 345" />
      </g>
      <path d="M110 352 L124 352 L132 369 L112 369Z" className="mannequin-base-part" />
    </svg>
  );
}

export default function AnatomyMannequin({ selectedGroup, onSelectGroup, view = 'both', compact = false, variant = 'default' }) {
  const norm = (selectedGroup || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const groups = {
    Peitoral: /peit/.test(norm),
    Costas: /cost|dors/.test(norm),
    Ombros: /omb|delt/.test(norm),
    Bíceps: /bicep/.test(norm),
    Tríceps: /tricep/.test(norm),
    Pernas: /pernas?|quadr|posterior|isquiotib|coxa|glute|panturr|gemeos|soleo/.test(norm),
    Abdômen: /abd|core/.test(norm),
    Antebraço: /antebraco|forearm/.test(norm),
    Trapézio: /trapez/.test(norm),
  };
  const isReferenceStyle = variant === 'reference' || variant === 'exercise';
  const figures = [];

  if (view === 'both' || view === 'front') {
    figures.push(
      <div className="mannequin-figure-box" key="front">
        <span className="mannequin-view-label">Frente</span>
        <FrontFigure groups={groups} onSelectGroup={onSelectGroup} />
      </div>,
    );
  }
  if (view === 'side') {
    figures.push(
      <div className="mannequin-figure-box" key="side">
        <span className="mannequin-view-label">Perfil</span>
        <SideFigure groups={groups} onSelectGroup={onSelectGroup} />
      </div>,
    );
  }
  if (view === 'both' || view === 'back') {
    figures.push(
      <div className="mannequin-figure-box" key="back">
        <span className="mannequin-view-label">Costas</span>
        <BackFigure groups={groups} onSelectGroup={onSelectGroup} />
      </div>,
    );
  }

  return (
    <div className={`anatomy-mannequin-container${compact ? ' compact' : ''}${isReferenceStyle ? ' reference-style' : ''}${variant === 'exercise' ? ' exercise-thumbnail' : ''}`}>
      {!compact && (
        <div className="anatomy-map-heading">
          <div className="anatomy-map-mark"><Activity size={15} strokeWidth={1.8} /></div>
          <div>
            <span className="anatomy-map-title">Mapa anatômico</span>
            <span className="anatomy-map-caption">Selecione uma região do corpo</span>
          </div>
          <span className="anatomy-map-index">{view === 'both' ? '02 VISTAS' : '01 VISTA'}</span>
        </div>
      )}
      <div className="mannequin-figures-row mannequin-stage">{figures}</div>
      {!compact && (
        <div className="mannequin-active-badge">
          <span className="badge-dot" />
          <span>Músculo Ativo: <strong>{selectedGroup || 'Geral'}</strong></span>
        </div>
      )}
    </div>
  );
}
