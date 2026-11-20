/* Lore manager UI. Loaded after mi-agenda.js; only enabled for portal_role=manager. */
(function () {
  const originalRender = render;
  render = function () {
    originalRender();
    if (!M.data || M.data.staff.portal_role !== "manager") return;
    const root = document.createElement("section");
    root.className = "sec";
    root.id = "lore-manager";
    const services = (M.data.services || []).filter(s => s.active);
    const options = services.map(s => '<option value="' + esc(s.id) + '" data-price="' + (s.price || 0) + '" data-duration="' + (s.duration || 60) + '">' + esc(s.name) + ' · ' + gs(s.price || 0) + '</option>').join("");
    const clients = M.data.clients || [];
    root.innerHTML = '<div class="sec-head"><h2>Gestión de tus turnos</h2></div>' +
      '<form id="lore-appt-form" class="login-card" style="max-width:100%;text-align:left;padding:18px">' +
      '<h3 id="lore-form-title">Registrar un turno</h3><input type="hidden" name="id">' +
      '<label class="lbl">Nombre de la clienta</label><input class="field" name="client_name" required maxlength="100" list="lore-clients">' +
      '<datalist id="lore-clients">' + clients.map(x => '<option value="' + esc(x.name) + '">').join("") + '</datalist>' +
      '<label class="lbl">WhatsApp</label><input class="field" name="client_phone" required inputmode="tel" placeholder="0981 123 456">' +
      '<label class="lbl">Fecha</label><input class="field" type="date" name="date" min="' + nowInSalon().key + '" required>' +
      '<label class="lbl">Hora</label><input class="field" type="time" name="time" step="900" required>' +
      '<label class="lbl">Servicio</label><select class="field" name="service_id" required><option value="">Elegir servicio</option>' + options + '<option value="__other">Otro (personalizado)</option></select>' +
      '<div id="lore-other" hidden><label class="lbl">Nombre del servicio</label><input class="field" name="other_name"><label class="lbl">Precio (Gs.)</label><input class="field" name="other_price" type="number" min="0"><label class="lbl">Duración (minutos)</label><input class="field" name="other_duration" type="number" min="15" value="60"></div>' +
      '<label class="lbl">Precio (Gs.)</label><input class="field" name="total" type="number" min="0" required>' +
      '<label class="lbl">Duración (minutos)</label><input class="field" name="duration" type="number" min="15" max="720" value="60" required>' +
      '<label class="lbl">Observaciones</label><textarea class="field" name="notes" rows="2"></textarea>' +
      '<div class="row"><button class="btn btn-rose" type="submit">Guardar turno confirmado</button><button class="btn btn-ghost" type="reset">Limpiar</button></div>' +
      '<p class="hint">Tus turnos se confirman automáticamente y aparecen en la agenda general.</p></form>' +
      '<div class="sec-head"><h2>Historial de clientas</h2></div>' +
      (clients.length ? '<div class="list">' + clients.map(cl => {
        const count = M.data.appointments.filter(a => a.client_id === cl.id).length;
        const history = (cl.history || []).map(h => '<small>' + esc(shortDate(h.date)) + ' · ' + esc((h.items || []).map(i => i.name).join(" + ") || "Servicio") + ' · ' + gs(h.total) + ' · ' + esc(STATUS[h.status] || h.status) + '</small>').join("");
        return '<div class="appt"><span class="a-main"><b>' + esc(cl.name) + '</b><small>' + esc(cl.phone || "Sin teléfono") + ' · ' + count + ' turno(s)</small>' + (cl.notes ? '<small>' + esc(cl.notes) + '</small>' : '') + history + '</span></div>';
      }).join("") + '</div>' : '<p class="hint">Todavía no hay historial de clientas.</p>');
    const view = document.querySelector("#view");
    view.insertBefore(root, view.children[1] || null);
  };

  document.addEventListener("change", function (e) {
    if (e.target.name !== "service_id") return;
    const f = document.querySelector("#lore-appt-form"), opt = e.target.selectedOptions[0];
    const other = document.querySelector("#lore-other");
    if (!f) return;
    other.hidden = e.target.value !== "__other";
    if (e.target.value !== "__other" && opt) {
      f.elements.total.value = opt.dataset.price;
      f.elements.duration.value = opt.dataset.duration;
    }
  });

  document.addEventListener("submit", async function (e) {
    if (e.target.id !== "lore-appt-form") return;
    e.preventDefault();
    const f = e.target, d = new FormData(f), sid = d.get("service_id");
    let item;
    if (sid === "__other") {
      f.elements.total.value = d.get("other_price");
      f.elements.duration.value = d.get("other_duration");
      const name = String(d.get("other_name") || "").trim();
      if (!name) { toast("Escribí el nombre del servicio."); return; }
      item = { service_id: null, name, price: Number(d.get("total")), duration: Number(d.get("duration")) };
    } else {
      const s = (M.data.services || []).find(x => x.id === sid);
      if (!s) { toast("Elegí un servicio."); return; }
      item = { service_id: s.id, name: s.name, price: Number(d.get("total")), duration: Number(d.get("duration")) };
    }
    const input = { id: d.get("id") || null, client_name: d.get("client_name"), client_phone: d.get("client_phone"),
      date: d.get("date"), start_min: toMin(d.get("time")), duration: Number(d.get("duration")),
      items: [item], total: Number(d.get("total")), notes: d.get("notes") };
    try { await M.db.staffSaveAppointment(M.code, input); await load(); render(); toast("Turno guardado y confirmado ✓"); }
    catch (err) { toast(err.message || "No se pudo guardar.", 4500); }
  });

  document.addEventListener("click", async function (e) {
    const b = e.target.closest("[data-act]");
    if (!b) return;
    const a = M.data && M.data.appointments.find(x => x.id === b.dataset.id);
    if (!a || a.created_by_staff !== M.data.staff.id) return;
    if (b.dataset.act === "edit-own") {
      const f = document.querySelector("#lore-appt-form"); if (!f) return;
      f.elements.id.value = a.id; f.elements.client_name.value = a.client_name || "";
      f.elements.client_phone.value = a.client_phone || ""; f.elements.date.value = a.date;
      f.elements.time.value = hhmm(a.start_min); f.elements.total.value = a.final_total ?? a.total;
      f.elements.duration.value = a.end_min - a.start_min; f.elements.notes.value = a.notes || "";
      const item = (a.items || [])[0];
      if (item && item.service_id) f.elements.service_id.value = item.service_id;
      else if (item) { f.elements.service_id.value = "__other"; document.querySelector("#lore-other").hidden = false; f.elements.other_name.value = item.name; f.elements.other_price.value = item.price; f.elements.other_duration.value = item.duration || (a.end_min-a.start_min); }
      document.querySelector("#lore-form-title").textContent = "Editar turno propio";
      f.scrollIntoView({ behavior: motion(), block: "center" });
    }
    if (b.dataset.act === "pay-own") {
      const extraName = String(prompt("¿Agregaste otro servicio? Escribí su nombre o dejá vacío.", "") || "").trim();
      const extraPrice = extraName ? Number(prompt("Precio del servicio adicional (Gs.)", "0")) : 0;
      if (!Number.isFinite(extraPrice) || extraPrice < 0) return;
      const total = Number(prompt("Total final de la cita (Gs.)", (a.final_total ?? a.total) + extraPrice));
      if (!Number.isFinite(total) || total < 0) return;
      const deposit = Number(prompt("Seña recibida (Gs.)", a.deposit || 0));
      if (!Number.isFinite(deposit) || deposit < 0) return;
      const paid = Number(prompt("Total acumulado cobrado, incluyendo la seña (Gs.)", a.paid_amount || deposit || 0));
      if (!Number.isFinite(paid) || paid < 0) return;
      try { await M.db.staffUpdatePayment(M.code, a.id, paid, total, deposit, extraName || null, extraPrice); await load(); render(); toast("Pagos actualizados ✓"); }
      catch (err) { toast(err.message, 4000); }
    }
    if (b.dataset.act === "cancel-own") {
      if (!confirm("¿Cancelar este turno?")) return;
      try { await M.db.staffCancelAppointment(M.code, a.id); await load(); render(); toast("Turno cancelado"); }
      catch (err) { toast(err.message, 4000); }
    }
  });
})();