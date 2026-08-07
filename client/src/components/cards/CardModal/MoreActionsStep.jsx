/*!
 * Copyright (c) 2024 PLANKA Software GmbH
 * Licensed under the Fair Use License: https://github.com/plankanban/planka/blob/master/LICENSE.md
 */

import React, { useCallback, useMemo } from 'react';
import PropTypes from 'prop-types';
import { shallowEqual, useDispatch, useSelector } from 'react-redux';
import { useTranslation } from 'react-i18next';
import { Icon, Menu } from 'semantic-ui-react';
import { Popup } from '../../../lib/custom-ui';

import selectors from '../../../selectors';
import entryActions from '../../../entry-actions';
import { useSteps } from '../../../hooks';
import { isListArchiveOrTrash } from '../../../utils/record-helpers';
import { BoardMembershipRoles, UserRoles } from '../../../constants/Enums';
import SelectCardTypeStep from '../SelectCardTypeStep';
import MoveCardStep from '../MoveCardStep';

import styles from './MoreActionsStep.module.scss';

const StepTypes = {
  EDIT_TYPE: 'EDIT_TYPE',
  MOVE: 'MOVE',
};

const MoreActionsStep = React.memo(({ onClose }) => {
  const selectListById = useMemo(() => selectors.makeSelectListById(), []);

  const card = useSelector(selectors.selectCurrentCard);
  const board = useSelector(selectors.selectCurrentBoard);

  const { canEditType, canDuplicate, canMove, canToggleLock } = useSelector((state) => {
    const list = selectListById(state, card.listId);

    const boardMembership = selectors.selectCurrentUserMembershipForCurrentBoard(state);
    const isEditor = !!boardMembership && boardMembership.role === BoardMembershipRoles.EDITOR;

    // Only an instance admin can lock/unlock a card, and only an admin can
    // change a locked card's own fields (moving, type, etc.).
    const isAdmin = selectors.selectCurrentUser(state).role === UserRoles.ADMIN;
    const canEditCard = isEditor && (!card.isLocked || isAdmin);

    if (isListArchiveOrTrash(list)) {
      return {
        canEditType: false,
        canDuplicate: false,
        canMove: canEditCard,
        canToggleLock: isAdmin,
      };
    }

    return {
      canEditType: canEditCard,
      canDuplicate: isEditor,
      canMove: canEditCard,
      canToggleLock: isAdmin,
    };
  }, shallowEqual);

  const dispatch = useDispatch();
  const [t] = useTranslation();
  const [step, openStep, handleBack] = useSteps();

  const handleTypeSelect = useCallback(
    (type) => {
      dispatch(
        entryActions.updateCurrentCard({
          type,
        }),
      );
    },
    [dispatch],
  );

  const handleDuplicateClick = useCallback(() => {
    dispatch(entryActions.duplicateCurrentCard());
  }, [dispatch]);

  const handleEditTypeClick = useCallback(() => {
    openStep(StepTypes.EDIT_TYPE);
  }, [openStep]);

  const handleMoveClick = useCallback(() => {
    openStep(StepTypes.MOVE);
  }, [openStep]);

  const handleToggleLockClick = useCallback(() => {
    dispatch(
      entryActions.updateCurrentCard({
        isLocked: !card.isLocked,
      }),
    );

    onClose();
  }, [card.isLocked, onClose, dispatch]);

  if (step) {
    switch (step.type) {
      case StepTypes.EDIT_TYPE:
        return (
          <SelectCardTypeStep
            withButton
            defaultValue={card.type}
            title="common.editType"
            buttonContent="action.save"
            onSelect={handleTypeSelect}
            onBack={handleBack}
            onClose={onClose}
          />
        );
      case StepTypes.MOVE:
        return <MoveCardStep id={card.id} onBack={handleBack} onClose={onClose} />;
      default:
    }
  }

  return (
    <>
      <Popup.Header>
        {t('common.moreActions', {
          context: 'title',
        })}
      </Popup.Header>
      <Popup.Content>
        <Menu secondary vertical className={styles.menu}>
          {!board.limitCardTypesToDefaultOne && canEditType && (
            <Menu.Item className={styles.menuItem} onClick={handleEditTypeClick}>
              <Icon name="map outline" className={styles.menuItemIcon} />
              {t('action.editType', {
                context: 'title',
              })}
            </Menu.Item>
          )}
          {canDuplicate && (
            <Menu.Item className={styles.menuItem} onClick={handleDuplicateClick}>
              <Icon name="copy outline" className={styles.menuItemIcon} />
              {t('action.duplicateCard', {
                context: 'title',
              })}
            </Menu.Item>
          )}
          {canMove && (
            <Menu.Item className={styles.menuItem} onClick={handleMoveClick}>
              <Icon name="share square outline" className={styles.menuItemIcon} />
              {t('action.moveCard', {
                context: 'title',
              })}
            </Menu.Item>
          )}
          {canToggleLock && (
            <Menu.Item className={styles.menuItem} onClick={handleToggleLockClick}>
              <Icon name={card.isLocked ? 'unlock' : 'lock'} className={styles.menuItemIcon} />
              {card.isLocked
                ? t('action.unlockCard', {
                    context: 'title',
                  })
                : t('action.lockCard', {
                    context: 'title',
                  })}
            </Menu.Item>
          )}
        </Menu>
      </Popup.Content>
    </>
  );
});

MoreActionsStep.propTypes = {
  onClose: PropTypes.func.isRequired,
};

export default MoreActionsStep;
