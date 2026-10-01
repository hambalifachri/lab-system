/* Printing reuses loaded data; it never changes schedules or makes API requests. */
window.LabSchedulePrint = (() => {
  const days = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
  const escape = value => String(value ?? '-').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const date = value => value ? new Date(value.slice(0, 10) + 'T00:00:00').toLocaleDateString('id-ID', {day:'numeric',month:'long',year:'numeric'}) : '-';
  const time = value => String(value || '').slice(0, 5).replace(':', '.');
  const matchRoom = (row, room) => String(row.room_name || '').trim().toUpperCase() === `LAB ${room}`;
  let oldTitle = '';

  function render({room, schedules, bookings, filters, day}) {
    const root = document.getElementById('schedulePrintRoot');
    const filter = row => matchRoom(row, room) && (day === 'Semua hari' || row.day_name === day);
    const fixed = schedules.filter(filter).slice().sort((a,b) => days.indexOf(a.day_name)-days.indexOf(b.day_name) || a.start_time.localeCompare(b.start_time) || String(a.subject).localeCompare(String(b.subject)));
    const single = bookings.filter(filter).slice().sort((a,b) => String(a.booking_date).localeCompare(String(b.booking_date)) || a.start_time.localeCompare(b.start_time));
    if (!oldTitle) oldTitle = document.title;
    document.title = `Jadwal Lab ${room} - ${filters.academic_year || 'Semua Tahun'} ${filters.academic_period || ''}`;
    document.body.classList.add('schedule-preview');
    root.replaceChildren();
    const pages = [];
    const subtitle = `${filters.academic_period ? `Semester ${filters.academic_period === 'gasal' ? 'Gasal' : 'Genap'}` : 'Semua Semester'} • ${filters.academic_year || 'Semua Tahun Akademik'}`;
    const ranges = new Set(fixed.map(row => `${row.period_start}|${row.period_end}`));
    const mixed = ranges.size > 1 || new Set(fixed.map(row => row.semester_label)).size > 1;

    function newPage(kind, rows) {
      const starts = rows.map(r => kind === 'fixed' ? r.period_start : r.booking_date).filter(Boolean).sort();
      const ends = rows.map(r => kind === 'fixed' ? r.period_end : r.booking_date).filter(Boolean).sort();
      const period = starts.length ? `${date(starts[0])} – ${date(ends.at(-1))}` : '-';
      const page = document.createElement('section');
      page.className = 'schedule-sheet';
      page.innerHTML = `<div class="schedule-sheet-body"><header class="schedule-letterhead"><div><div class="schedule-university">UNIVERSITAS MERCU BUANA</div><div class="schedule-faculty">FAKULTAS TEKNIK</div></div><div class="schedule-lab">LABORATORIUM KOMPUTER<strong>${escape(room)}</strong></div></header><h1>JADWAL PENGGUNAAN LABORATORIUM</h1><div class="schedule-subtitle">${escape(subtitle)}</div><div class="schedule-meta"><span>${mixed && kind === 'fixed' ? 'Rentang jadwal' : 'Periode'}: ${escape(period)}</span><span>${escape(day)}</span></div><div class="schedule-section-title">${kind === 'fixed' ? 'Jadwal Tetap Semester' : 'Booking Sekali Pakai'}</div><table><colgroup><col style="width:4%"><col style="width:11%"><col style="width:14%"><col style="width:34%"><col style="width:12%"><col style="width:25%"></colgroup><thead><tr><th>No.</th><th>${kind === 'fixed' ? 'Hari' : 'Hari / Tanggal'}</th><th>Waktu</th><th>Mata Kuliah / Kegiatan</th><th>Kelas</th><th>${kind === 'fixed' ? 'Dosen' : 'Penanggung Jawab'}</th></tr></thead><tbody></tbody></table></div><footer class="schedule-sheet-footer"><span>FAKULTAS TEKNIK • LAB ${escape(room)}</span><span class="schedule-page-number"></span></footer>`;
      root.append(page);
      const result = {page, body:page.querySelector('.schedule-sheet-body'), tbody:page.querySelector('tbody'), kind, rows};
      pages.push(result);
      return result;
    }
    const fits = p => p.body.scrollHeight <= p.body.clientHeight + 1;
    function buildSection(rows, kind) {
      if (!rows.length) return;
      let p = newPage(kind, rows);
      rows.forEach((row,index) => {
        const tr = document.createElement('tr');
        tr.dataset.recordId = String(row.id ?? index);
        if (index && rows[index-1].day_name !== row.day_name) tr.className = 'day-start';
        const detail = kind === 'fixed' && mixed ? `<span class="print-detail">${escape(row.semester_label)}<br>${escape(date(row.period_start))} – ${escape(date(row.period_end))}</span>` : '';
        tr.innerHTML = `<td>${index+1}</td><td>${escape(row.day_name)}${kind === 'single' ? `<span class="print-detail">${escape(date(row.booking_date))}</span>` : ''}</td><td class="print-time">${escape(time(row.start_time))}–${escape(time(row.end_time))}</td><td><strong>${escape(kind === 'fixed' ? row.subject : row.purpose)}</strong>${detail}</td><td>${escape(row.class_name || '-')}</td><td>${escape(kind === 'fixed' ? row.lecturer_name : row.borrower_name)}</td>`;
        p.tbody.append(tr);
        if ((!fits(p) || p.tbody.children.length > 15) && p.tbody.children.length > 1) {
          tr.remove(); p = newPage(kind, rows); p.tbody.append(tr);
        }
        if (!fits(p)) throw new Error('Ada teks jadwal yang terlalu panjang untuk satu halaman. Ringkas keterangan jadwal sebelum mencetak.');
      });
    }
    buildSection(fixed, 'fixed');
    buildSection(single, 'single');
    if (!pages.length) {
      const p = newPage('fixed', []);
      p.body.querySelector('table').remove();
      const empty = document.createElement('p');
      empty.className = 'schedule-empty-print';
      empty.textContent = 'Tidak ada jadwal untuk laboratorium dan filter yang dipilih.';
      p.body.append(empty);
    }
    const last = pages.at(-1);
    const signatures = document.createElement('div');
    signatures.className = 'schedule-signatures';
    signatures.innerHTML = '<div>Disusun oleh,<br>Laboran Komputer<strong>Fachri Hambali, S.Kom</strong></div><div>Mengetahui,<br>Wakil Dekan<strong>Dr. Ir. Joni Hardi, M.T.</strong></div>';
    last.body.append(signatures);
    if (!fits(last)) {
      const moved = [];
      while (!fits(last) && last.tbody.lastElementChild) {
        const tr = last.tbody.lastElementChild; tr.remove(); moved.unshift(tr);
      }
      signatures.remove();
      const next = newPage(last.kind, last.rows);
      moved.forEach(tr => next.tbody.append(tr));
      next.body.append(signatures);
      if (!last.tbody.children.length) { last.page.remove(); pages.splice(pages.indexOf(last),1); }
      if (!fits(next)) throw new Error('Jadwal terlalu panjang untuk ruang tanda tangan. Ringkas keterangan sebelum mencetak.');
    }
    pages.forEach((p,index) => p.page.querySelector('.schedule-page-number').textContent = `Halaman ${index+1} dari ${pages.length}`);
    window.scrollTo(0,0);
    return pages.length;
  }
  function close() {
    document.body.classList.remove('schedule-preview');
    document.getElementById('schedulePrintRoot').replaceChildren();
    if (oldTitle) document.title = oldTitle;
    oldTitle = '';
  }
  return {render, close};
})();
