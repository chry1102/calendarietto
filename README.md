# Lezioni

Calendario universitario mobile-first con stile *Frosted Glass* scuro e a bassa luminosità.

## Cosa fa

- Vista settimanale ottimizzata per telefono, con dettagli della lezione al tocco.
- Creazione, modifica ed eliminazione delle lezioni dall’interfaccia.
- Importazione di uno o più feed iCalendar/ICS: il proprio orario, Corso A/B e quelli degli amici.
- Filtro immediato per **Corso A**, **Corso B** o tutti gli appuntamenti.
- I calendari vengono memorizzati in `localStorage`; le lezioni manuali e le modifiche locali resistono agli aggiornamenti del feed.
- All’apertura, ogni feed viene aggiornato se l’ultimo aggiornamento ha almeno 24 ore. La UI e l’ultima cache rimangono disponibili offline dopo la prima visita.

## Pubblicazione

È un sito statico senza build:

1. In GitHub apri **Settings → Pages** del repository.
2. Seleziona *Deploy from a branch*, branch `main`, cartella `/(root)`.
3. Apri l’URL Pages che GitHub fornisce.

Su iPhone/Android si può poi usare “Aggiungi a schermata Home”.

## Importare l’orario

Apri ⚙, assegna un nome al calendario, incolla l’URL che termina in `.ics` (o un feed iCalendar) e scegli l’etichetta Corso A, B oppure Altro. Per i corsi degli amici aggiungi un altro calendario: ogni feed mantiene la propria cache.

Il browser può leggere un feed remoto solo se il server dell’università permette richieste cross-origin (CORS). Se compare un errore di aggiornamento, il calendario e l’ultima copia valida restano comunque salvati; chiedi all’università un feed ICS con CORS abilitato o usa un proxy personale che esponga il feed.

## Dati e privacy

Non ci sono account, password, token, cookie di sessione o chiavi API. URL dei feed, eventi importati, lezioni manuali e preferenze sono salvati esclusivamente nel browser e non vengono inviati a un backend. Cancellare i dati del sito cancella anche questi calendari.

> L’aggiornamento giornaliero avviene alla prima apertura dell’app dopo 24 ore: un sito statico non può eseguire un refresh in background mentre il telefono è spento o la pagina è chiusa.
