BOJKELA BARBER - NODE 24 + ADMIN

1. U ovom folderu:
   npm install
2. Zatim:
   npm start
3. Otvori:
   http://localhost:3000

KORISNIK:
- Registracija i prijava kao obican korisnik.
- Rezervacije se cuvaju u data/appointments.json.

DJole / ADMIN:
- Korisnicko ime: djole
- Lozinka: Bojkela123!
- Posle prijave otvara se admin panel.
- Vidi sva zakazivanja za tekuci mesec.
- Moze da otkaze aktivan termin.
- Dugme "Izvezi ovaj mesec u Excel" preuzima .xlsx fajl sa svim zakazivanjima tog meseca.

VAZNO:
Za javni sajt obavezno promeniti ADMIN_PASSWORD preko environment varijable.
Primer na Windows CMD:
set ADMIN_PASSWORD=NovaJakaLozinka
npm start
