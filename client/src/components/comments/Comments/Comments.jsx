/*!
 * Copyright (c) 2024 PLANKA Software GmbH
 * Licensed under the Fair Use License: https://github.com/plankanban/planka/blob/master/LICENSE.md
 */

import React, { useCallback, useMemo, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useInView } from 'react-intersection-observer';
import { Comment, Loader } from 'semantic-ui-react';

import selectors from '../../../selectors';
import entryActions from '../../../entry-actions';
import { isListArchiveOrTrash } from '../../../utils/record-helpers';
import { BoardMembershipRoles, UserRoles } from '../../../constants/Enums';
import Item from './Item';
import Add from './Add';

import styles from './Comments.module.scss';

const Comments = React.memo(() => {
  const selectListById = useMemo(() => selectors.makeSelectListById(), []);

  const commentIds = useSelector(selectors.selectCommentIdsForCurrentCard);
  const { isCommentsFetching, isAllCommentsFetched } = useSelector(selectors.selectCurrentCard);

  const cadAdd = useSelector((state) => {
    const card = selectors.selectCurrentCard(state);
    const list = selectListById(state, card.listId);

    if (isListArchiveOrTrash(list)) {
      return false;
    }

    // A locked card is read-only for everyone except instance admins.
    const isAdmin = selectors.selectCurrentUser(state).role === UserRoles.ADMIN;
    if (card.isLocked && !isAdmin) {
      return false;
    }

    const boardMembership = selectors.selectCurrentUserMembershipForCurrentBoard(state);

    let isMember = false;
    let isEditor = false;

    if (boardMembership) {
      isMember = true;
      isEditor = boardMembership.role === BoardMembershipRoles.EDITOR;
    }

    return isEditor || (isMember && boardMembership.canComment);
  });

  const dispatch = useDispatch();
  const [replyText, setReplyText] = useState();

  const handleReply = useCallback((username) => {
    setReplyText(`@${username} `);
  }, []);

  const handleReplyTextConsumed = useCallback(() => {
    setReplyText(undefined);
  }, []);

  const [inViewRef] = useInView({
    threshold: 1,
    onChange: (inView) => {
      if (inView) {
        dispatch(entryActions.fetchCommentsInCurrentCard());
      }
    },
  });

  return (
    <>
      {cadAdd && <Add initialText={replyText} onInitialTextConsumed={handleReplyTextConsumed} />}
      <div className={styles.itemsWrapper}>
        <Comment.Group className={styles.items}>
          {commentIds.map((commentId) => (
            <Item key={commentId} id={commentId} canReply={cadAdd} onReply={handleReply} />
          ))}
        </Comment.Group>
      </div>
      {isCommentsFetching !== undefined && isAllCommentsFetched !== undefined && (
        <div className={styles.loaderWrapper}>
          {isCommentsFetching ? (
            <Loader active inverted inline="centered" size="small" />
          ) : (
            !isAllCommentsFetched && <div ref={inViewRef} />
          )}
        </div>
      )}
    </>
  );
});

export default Comments;
