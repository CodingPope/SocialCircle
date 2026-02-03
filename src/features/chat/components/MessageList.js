import React, { forwardRef } from 'react';
import { FlatList, View, Text, Image, TouchableOpacity } from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import smileDefault from '../../../../assets/smileDefault.png';

const MessageList = forwardRef(function MessageList(
  { messages, renderItem, onEndReached, ListHeaderComponent, ListEmptyComponent, contentContainerStyle, inverted = true },
  ref,
) {
  return (
    <FlatList
      ref={ref}
      data={messages}
      keyExtractor={(item, index) => (item?.id ? String(item.id) : `msg-${index}`)}
      renderItem={renderItem}
      inverted={inverted}
      onEndReached={onEndReached}
      onEndReachedThreshold={0.2}
      ListHeaderComponent={ListHeaderComponent}
      ListEmptyComponent={ListEmptyComponent}
      contentContainerStyle={contentContainerStyle}
    />
  );
});

export default MessageList;
