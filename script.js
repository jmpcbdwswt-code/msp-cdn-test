
/* ==========================================================
   Stratford Knights Boys Tennis
   ========================================================== */

const players = [
  { name: "Joshua White",    number: 1, wins: 6, losses: 9  },
  { name: "Ryan Heusinger",  number: 2, wins: 3, losses: 10 },
  { name: "Owen Drum",       number: 3, wins: 3, losses: 10 },
  { name: "Caden Privette",  number: 4, wins: 1, losses: 8  },
  { name: "Sawyer Smith",    number: 5, wins: 0, losses: 6  },
  { name: "Landon Mathews",  number: 6, wins: 0, losses: 8  },
  { name: "Daniel Petty",    number: 7, wins: 0, losses: 1  }
];


/* ---------- Win percentage ---------- */

function winPercent(player) {
  const played = player.wins + player.losses;
  return played > 0 ? (player.wins / played) * 100 : 0;
}


/* ---------- Team totals in the hero ---------- */

const totalWins = players.reduce((sum, p) => sum + p.wins, 0);
const totalLosses = players.reduce((sum, p) => sum + p.losses, 0);

countUp(document.getElementById("teamWins"), totalWins);
countUp(document.getElementById("teamLosses"), totalLosses);
countUp(document.getElementById("teamPlayers"), players.length);


function countUp(el, target) {
  if (!el) return;

  const reduced =
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (reduced || target === 0) {
    el.textContent = target;
    return;
  }

  const duration = 900;
  const start = performance.now();

  function step(now) {
    const t = Math.min((now - start) / duration, 1);
    const eased = 1 - Math.pow(1 - t, 3);

    el.textContent = Math.round(target * eased);

    if (t < 1) {
      requestAnimationFrame(step);
    }
  }

  requestAnimationFrame(step);
}


/* ==========================================================
   Roster carousel
   ========================================================== */

let currentPlayer = 0;

const playerCard = document.getElementById("playerCard");
const playerName = document.getElementById("playerName");
const playerNumber = document.getElementById("playerNumber");
const playerWins = document.getElementById("playerWins");
const playerLosses = document.getElementById("playerLosses");
const playerWinPercentEl =
  document.getElementById("playerWinPercent");
const playerBar = document.getElementById("playerBar");
const dots = document.getElementById("dots");


function showPlayer(animate) {
  const player = players[currentPlayer];
  const pct = winPercent(player);

  playerName.textContent = player.name;
  playerNumber.textContent = player.number;
  playerWins.textContent = player.wins;
  playerLosses.textContent = player.losses;
  playerWinPercentEl.textContent = Math.round(pct) + "%";
  playerBar.style.width = pct + "%";

  if (dots) {
    [...dots.children].forEach((dot, i) => {
      dot.setAttribute(
        "aria-current",
        i === currentPlayer ? "true" : "false"
      );
    });
  }

  if (animate && playerCard) {
    playerCard.classList.remove("swap");
    void playerCard.offsetWidth;
    playerCard.classList.add("swap");
  }
}


/* ---------- Build roster dots ---------- */

if (dots) {
  players.forEach((player, index) => {
    const dot = document.createElement("button");

    dot.type = "button";
    dot.setAttribute(
      "aria-label",
      "Show " + player.name
    );

    dot.addEventListener("click", () => {
      currentPlayer = index;
      showPlayer(true);
    });

    dots.appendChild(dot);
  });
}


/* ---------- Roster next button ---------- */

const nextButton = document.getElementById("nextButton");

if (nextButton) {
  nextButton.addEventListener("click", () => {
    currentPlayer =
      (currentPlayer + 1) % players.length;

    showPlayer(true);
  });
}


/* ---------- Roster previous button ---------- */

const previousButton =
  document.getElementById("previousButton");

if (previousButton) {
  previousButton.addEventListener("click", () => {
    currentPlayer =
      (currentPlayer - 1 + players.length) %
      players.length;

    showPlayer(true);
  });
}


/* ---------- Arrow keys move through roster ---------- */

document.addEventListener("keydown", (event) => {

  if (event.target.tagName === "INPUT") {
    return;
  }

  if (event.key === "ArrowRight" && nextButton) {
    nextButton.click();
  }

  if (event.key === "ArrowLeft" && previousButton) {
    previousButton.click();
  }

});


/* ==========================================================
   Records list
   ========================================================== */

const statsList =
  document.getElementById("statsList");

if (statsList) {

  players.forEach((player) => {

    const pct = winPercent(player);
    const played = player.wins + player.losses;

    const row = document.createElement("li");

    row.innerHTML = `
      <span class="who">${player.name}</span>

      <span class="rowbar">
        <i style="width:${pct}%"></i>
      </span>

      <span class="rec-line">
        <b>${player.wins}&ndash;${player.losses}</b>
        <small>${played} matches</small>
      </span>
    `;

    statsList.appendChild(row);

  });

}


/* ==========================================================
   Search
   ========================================================== */

const search =
  document.getElementById("search");

const searchMessage =
  document.getElementById("searchMessage");


if (search) {

  /* ---------- Secret search ---------- */

  search.addEventListener("keydown", (event) => {

    if (event.key !== "Enter") {
      return;
    }

    const text =
      search.value.trim().toLowerCase();

    if (text === "landonsucks") {
      window.location.href = "secret.html";
      return;
    }

  });


  /* ---------- Normal player search ---------- */

  if (searchMessage) {

    search.addEventListener("input", () => {

      const text =
        search.value.trim().toLowerCase();

      if (text === "") {

        searchMessage.textContent = "";
        searchMessage.className =
          "search-message";

        return;
      }


      const index =
        players.findIndex((p) =>
          p.name.toLowerCase().includes(text)
        );


      if (index > -1) {

        currentPlayer = index;
        showPlayer(true);

        searchMessage.textContent =
          "Showing " + players[index].name + ".";

        searchMessage.className =
          "search-message found";

      } else {

        searchMessage.textContent =
          "No player by that name. Try a last name.";

        searchMessage.className =
          "search-message missing";

      }

    });

  }

}


/* ---------- Start on first player ---------- */

showPlayer(false);


/* ==========================================================
   Team Pictures Carousel
   Moves one full group of 4 pictures at a time.
   Supports arrow buttons AND swipe.
   ========================================================== */

const photoTrack =
  document.getElementById("photoTrack");

const photoPrevious =
  document.getElementById("photoPrevious");

const photoNext =
  document.getElementById("photoNext");

let photoPage = 0;


function movePhotos() {

  if (!photoTrack) {
    return;
  }

  const totalPages =
    photoTrack.children.length;

  if (totalPages === 0) {
    return;
  }

  if (photoPage >= totalPages) {
    photoPage = 0;
  }

  if (photoPage < 0) {
    photoPage = totalPages - 1;
  }

  photoTrack.style.transform =
    "translateX(-" +
    (photoPage * 100) +
    "%)";
}


/* ---------- Picture Next button ---------- */

if (photoNext) {

  photoNext.addEventListener("click", () => {

    photoPage++;

    movePhotos();

  });

}


/* ---------- Picture Previous button ---------- */

if (photoPrevious) {

  photoPrevious.addEventListener("click", () => {

    photoPage--;

    movePhotos();

  });

}


/* ==========================================================
   Swipe Team Pictures
   ========================================================== */

let touchStartX = 0;
let touchStartY = 0;


if (photoTrack) {

  photoTrack.addEventListener(
    "touchstart",
    (event) => {

      const touch =
        event.changedTouches[0];

      touchStartX = touch.screenX;
      touchStartY = touch.screenY;

    },
    { passive: true }
  );


  photoTrack.addEventListener(
    "touchend",
    (event) => {

      const touch =
        event.changedTouches[0];

      const touchEndX = touch.screenX;
      const touchEndY = touch.screenY;

      const differenceX =
        touchStartX - touchEndX;

      const differenceY =
        touchStartY - touchEndY;


      // Only treat it as a swipe
      // if movement is mostly horizontal

      if (
        Math.abs(differenceX) <=
        Math.abs(differenceY)
      ) {
        return;
      }


      // Swipe left = next group

      if (differenceX > 50) {

        photoPage++;

        movePhotos();

      }


      // Swipe right = previous group

      if (differenceX < -50) {

        photoPage--;

        movePhotos();

      }

    },
    { passive: true }
  );

}


/* ---------- Start on first picture group ---------- */

movePhotos();


/* ==========================================================
   Expand Team Pictures
   ========================================================== */

const photoModal =
  document.getElementById("photoModal");

const expandedPhoto =
  document.getElementById("expandedPhoto");

const closePhoto =
  document.getElementById("closePhoto");

const expandButtons =
  document.querySelectorAll(".expand-button");


/* ---------- Open picture ---------- */

expandButtons.forEach((button) => {

  button.addEventListener("click", (event) => {

    event.stopPropagation();

    const photo =
      button.parentElement.querySelector("img");

    if (!photo) {
      return;
    }

    expandedPhoto.src = photo.src;
    expandedPhoto.alt = photo.alt;

    photoModal.classList.add("show");

    document.body.style.overflow = "hidden";

  });

});


/* ---------- Close picture ---------- */

function closeExpandedPhoto() {

  photoModal.classList.remove("show");

  expandedPhoto.src = "";

  document.body.style.overflow = "";

}


if (closePhoto) {

  closePhoto.addEventListener(
    "click",
    (event) => {

      event.stopPropagation();

      closeExpandedPhoto();

    }
  );

}


/* ---------- Click dark background to close ---------- */

if (photoModal) {

  photoModal.addEventListener(
    "click",
    (event) => {

      if (event.target === photoModal) {
        closeExpandedPhoto();
      }

    }
  );

}


/* ---------- Escape key closes picture ---------- */

document.addEventListener("keydown", (event) => {

  if (event.key === "Escape") {
    closeExpandedPhoto();
  }

});

