import {
  addBtnListner,
  downloadCsv,
  wait,
  hideLoader,
  showLoader,
} from "../utils/commonUtil";
import { getConceptPlayers } from "../services/conceptplayer";
import { MAX_CLUB_SEARCH } from "../app.constants";
import { addFutbinCachePrice } from "../utils/futbinUtil";
import { getValue } from "./repository";

export const getSquadPlayerIds = () => {
  return new Promise((resolve, reject) => {
    const squadPlayerIds = new Set();
    getAllClubPlayers(true).then((squadMembers) => {
      squadMembers.forEach((member) => {
        if (member.loans < 0) squadPlayerIds.add(member.definitionId);
      });
      resolve(squadPlayerIds);
    });
  });
};

export const getSquadPlayerLookup = () => {
  return new Promise((resolve, reject) => {
    const squadPlayersLookup = new Map();
    getAllClubPlayers(true).then((squadMembers) => {
      squadMembers.forEach((member) => {
        if (member.loans < 0)
          squadPlayersLookup.set(member.definitionId, member);
      });
      resolve(squadPlayersLookup);
    });
  });
};

export const getAllClubPlayers = function (filterLoaned, playerId) {
  return new Promise((resolve, reject) => {
    const searchCriteria = new UTBucketedItemSearchViewModel().searchCriteria;
    if (playerId) {
      searchCriteria.defId = [playerId];
    }
    searchCriteria.count = MAX_CLUB_SEARCH;
    let gatheredSquad = [];

    const getAllSquadMembers = () => {
      getClubSquad(searchCriteria).observe(
        this,
        async function (sender, response) {
          gatheredSquad = [
            ...response.data.items.filter(
              (item) => !filterLoaned || item.loans < 0
            ),
          ];
          if (response.status !== 400 && !response.data.retrievedAll) {
            searchCriteria.offset += searchCriteria.count;
            await wait(1);
            getAllSquadMembers();
          } else {
            resolve(gatheredSquad);
          }
        }
      );
    };
    getAllSquadMembers();
  });
};

export const getPlayersForSbc = async (playerIds) => {
  const players = {};
  await getAllClubPlayers(true); // Load All Players once to avoid individual network calls
  for (const playerId in playerIds) {
    const parsedPlayerId = parseInt(playerId, 10);
    let playerInfo = (await getAllClubPlayers(true, parsedPlayerId)).find(
      (player) => player.definitionId === parsedPlayerId
    );
    if (!playerInfo) {
      await wait(1);
      playerInfo = (await getConceptPlayers(parsedPlayerId)).find(
        (player) => player.definitionId === parsedPlayerId
      );
    }
    players[playerId] = playerInfo;
    await wait(1.5);
  }
  return players;
};

const getClubSquad = (searchCriteria) => {
  return services.Item.searchClub(searchCriteria);
};

const downloadClub = async () => {
  showLoader();
  let squadMembers = await getAllClubPlayers();
  squadMembers = squadMembers.sort((a, b) => b.rating - a.rating);

  await addFutbinCachePrice(squadMembers);

  let csvContent = "";
  const headers =
    "Player Name,Rating,Quality,Rarity,Position,Nation,League,Club,Price Range,FUTBIN Price,Bought For,Discard Value,Contract Left,IsUntradable,IsLoaned";
  csvContent += headers + "\r\n";
  for (const squadMember of squadMembers) {
    let rowRecord = "";
    rowRecord += squadMember._staticData.name + ",";
    rowRecord += squadMember.rating + ",";
    rowRecord += getCardQuality(squadMember) + ",";
    if (ItemRarity[squadMember.rareflag]) {
      rowRecord += !squadMember.rareflag
        ? "COMMON,"
        : ItemRarity[squadMember.rareflag] + ",";
    } else if (squadMember.isSpecial()) {
      rowRecord += "SPECIAL,";
    } else {
      rowRecord += ",";
    }
    rowRecord +=
      UTLocalizationUtil.positionIdToName(
        squadMember.preferredPosition,
        services.Localization
      ) + ",";
    rowRecord +=
      UTLocalizationUtil.nationIdToName(
        squadMember.nationId,
        services.Localization
      ) + ",";
    rowRecord +=
      UTLocalizationUtil.leagueIdToName(
        squadMember.leagueId,
        services.Localization
      ) + ",";
    rowRecord +=
      UTLocalizationUtil.teamIdToAbbr15(
        squadMember.teamId,
        services.Localization
      ) + ",";
    if (squadMember._itemPriceLimits) {
      rowRecord +=
        "Min: " +
        squadMember._itemPriceLimits.minimum +
        " Max: " +
        squadMember._itemPriceLimits.maximum +
        ",";
    } else {
      rowRecord += "--NA--,";
    }
    const existingValue = getValue(squadMember.definitionId);
    if (existingValue && existingValue.price) {
      rowRecord += existingValue.price.replace(/[,.]/g, "") + ",";
    } else {
      rowRecord += "--NA--,";
    }
    rowRecord += squadMember.lastSalePrice + ",";
    rowRecord += squadMember.discardValue + ",";
    rowRecord += squadMember.contract + ",";
    rowRecord += squadMember.untradeable + ",";
    rowRecord += (squadMember.loans >= 0) + ",";

    csvContent += rowRecord + "\r\n";
  }
  const club = services.User.getUser().getSelectedPersona().getCurrentClub();
  downloadCsv(csvContent, club.name);

  hideLoader();
};

const getCardQuality = (card) => {
  if (card.isGoldRating()) {
    return "Gold";
  } else if (card.isSilverRating()) {
    return "Silver";
  } else if (card.isBronzeRating()) {
    return "Bronze";
  }
  return "";
};

addBtnListner("#downloadClub", async function () {
  await downloadClub();
});
